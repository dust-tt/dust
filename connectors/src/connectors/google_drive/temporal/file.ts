import type { CoreAPIDataSourceDocumentSection, ModelId } from "@dust-tt/types";
import tracer from "dd-trace";
import type { OAuth2Client } from "googleapis-common";
import { GaxiosError } from "googleapis-common";
import type { CreationAttributes } from "sequelize";

import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getMimeTypesToDownload,
  isGoogleDriveSpreadSheetFile,
  isTableFile,
  MIME_TYPES_TO_EXPORT,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import { syncSpreadSheet } from "@connectors/connectors/google_drive/temporal/spreadsheets";
import {
  getDriveClient,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import {
  handleCsvFile,
  handleTextExtraction,
  handleTextFile,
} from "@connectors/connectors/shared/file";
import {
  MAX_DOCUMENT_TXT_LEN,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  MAX_LARGE_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  sectionLength,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
} from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

async function handleGoogleDriveExport(
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  localLogger: Logger
): Promise<CoreAPIDataSourceDocumentSection | null> {
  const drive = await getDriveClient(oauth2client);
  try {
    const res = await drive.files.export({
      fileId: file.id,
      mimeType: MIME_TYPES_TO_EXPORT[file.mimeType],
    });
    if (res.status !== 200) {
      localLogger.error({}, "Error exporting Google document");
      throw new Error(
        `Error exporting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }

    if (typeof res.data === "string") {
      return res.data.trim().length > 0
        ? {
            prefix: null,
            content: res.data.trim(),
            sections: [],
          }
        : null;
    } else if (
      ["object", "number", "boolean", "bigint"].includes(typeof res.data)
    ) {
      // In case the contents returned by the file export matches a JS type,
      // we need to convert it
      // Example: a Google presentation with just the number
      // 1 in it, the export will return the number 1 instead of a string
      return res.data && res.data.toString().trim().length > 0
        ? {
            prefix: null,
            content: res.data.toString().trim(),
            sections: [],
          }
        : null;
    } else {
      localLogger.error(
        {
          resDataTypeOf: typeof res.data,
          type: "export",
        },
        "Unexpected GDrive export response type"
      );
      return null;
    }
  } catch (e) {
    if (e instanceof GaxiosError && e.response?.status === 404) {
      localLogger.info(
        {
          error: e,
        },
        "Can't export Gdrive document. 404 error returned, even though we know the file exists. Skipping."
      );
      return null;
    }

    localLogger.error({ error: e }, "Error exporting Google document");
    throw e;
  }
}

async function handleFileExport(
  oauth2client: OAuth2Client,
  documentId: string,
  file: GoogleDriveObjectType,
  maxDocumentLen: number,
  localLogger: Logger,
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  startSyncTs: number
): Promise<CoreAPIDataSourceDocumentSection | null> {
  const drive = await getDriveClient(oauth2client);
  let res;
  try {
    res = await drive.files.get(
      {
        fileId: file.id,
        alt: "media",
      },
      {
        responseType: "arraybuffer",
      }
    );
  } catch (e) {
    if (e instanceof GaxiosError) {
      if (e.response?.status === 404) {
        localLogger.info(
          {
            error: e,
          },
          "Can't export Gdrive file. 404 error returned. Skipping."
        );
        return null;
      }
      if (e.response?.status === 403) {
        const skippableReasons = ["cannotDownloadAbusiveFile"];
        try {
          const body = Buffer.from(e.response.data).toString("utf-8").trim();
          const parsedBody = JSON.parse(body);
          const errors: { reason: string }[] | undefined =
            parsedBody.error?.errors;
          const firstSkippableReason = errors?.find((error) =>
            skippableReasons.includes(error.reason)
          )?.reason;
          if (firstSkippableReason) {
            localLogger.info(
              { error: parsedBody.error },
              `Can't export Gdrive file. Skippable reason: ${firstSkippableReason} Skipping.`
            );
            return null;
          }
        } catch (e) {
          localLogger.error({ error: e }, "Error while parsing error response");
        }
      }
    }
    const maybeErrorWithCode = e as { code: string };
    if (maybeErrorWithCode.code === "ERR_OUT_OF_RANGE") {
      localLogger.info({}, "File too big to be downloaded. Skipping");
      return null;
    }
    throw e;
  }

  if (res.status !== 200) {
    throw new Error(
      `Error downloading Google document. status_code: ${res.status}. status_text: ${res.statusText}`
    );
  }

  if (!(res.data instanceof ArrayBuffer)) {
    localLogger.error({}, "res.data is not an ArrayBuffer");
    return null;
  }
  let result;
  if (file.mimeType === "text/plain") {
    result = handleTextFile(res.data, maxDocumentLen);
  } else if (file.mimeType === "text/csv") {
    const parentGoogleIds = await getFileParentsMemoized(
      connectorId,
      oauth2client,
      file,
      startSyncTs
    );

    const parents = parentGoogleIds.map((parent) => getInternalId(parent));

    result = await handleCsvFile({
      data: res.data,
      tableId: documentId,
      fileName: file.name || "",
      maxDocumentLen,
      localLogger,
      dataSourceConfig,
      provider: "google_drive",
      connectorId,
      // TODO(kw_search) remove legacy parentGoogleIds
      parents: [...parents, ...parentGoogleIds],
    });
  } else {
    result = await handleTextExtraction(res.data, localLogger, file.mimeType);
  }
  if (result.isErr()) {
    return null;
  }

  return result.value;
}

export async function syncOneFile(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveObjectType,
  startSyncTs: number,
  isBatchSync = false
): Promise<boolean> {
  return tracer.trace(
    "gdrive",
    {
      resource: "syncOneFile",
    },
    async (span) => {
      span?.setTag("connectorId", connectorId);
      span?.setTag("fileId", file.id);
      span?.setTag("workspaceId", dataSourceConfig.workspaceId);

      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      const config = await GoogleDriveConfig.findOne({
        where: {
          connectorId,
        },
      });

      const documentId = getInternalId(file.id);
      const fileInDb = await GoogleDriveFiles.findOne({
        where: { connectorId, driveFileId: file.id },
      });

      const localLogger = logger.child({
        provider: "google_drive",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        connectorId,
        documentId,
        fileId: file.id,
        title: file.name,
        mimeType: file.mimeType,
      });

      // Early return if lastSeenTs is greater than workflow start.
      // This allows avoiding resyncing already-synced documents in case of activity failure
      if (fileInDb?.lastSeenTs && fileInDb.lastSeenTs > new Date(startSyncTs)) {
        return true;
      }

      if (fileInDb?.skipReason) {
        localLogger.info(
          {},
          `Google Drive document skipped with skip reason ${fileInDb.skipReason}`
        );
        return false;
      }
      if (!file.capabilities.canDownload) {
        localLogger.info(
          {},
          "Google Drive document skipped because it cannot be downloaded"
        );
        return false;
      }

      // If the file is too big to be downloaded, we skip it.
      if (file.size && file.size > MAX_FILE_SIZE_TO_DOWNLOAD) {
        localLogger.info(
          "[Google Drive document] file size exceeded, skipping further processing."
        );
        return false;
      }

      const maxDocumentLen = config?.largeFilesEnabled
        ? MAX_LARGE_DOCUMENT_TXT_LEN
        : MAX_DOCUMENT_TXT_LEN;

      if (isTableFile(file)) {
        return syncOneFileTable(
          connectorId,
          oauth2client,
          file,
          localLogger,
          dataSourceConfig,
          maxDocumentLen,
          startSyncTs
        );
      } else {
        return syncOneFileTextDocument(
          connectorId,
          oauth2client,
          file,
          localLogger,
          config,
          dataSourceConfig,
          startSyncTs,
          isBatchSync,
          maxDocumentLen
        );
      }
    }
  );
}

async function syncOneFileTable(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  localLogger: Logger,
  dataSourceConfig: DataSourceConfig,
  maxDocumentLen: number,
  startSyncTs: number
) {
  let skipReason: string | undefined;
  const upsertTimestampMs = undefined;

  const documentId = getInternalId(file.id);

  if (isGoogleDriveSpreadSheetFile(file)) {
    const res = await syncSpreadSheet(
      oauth2client,
      connectorId,
      file,
      startSyncTs
    );
    if (!res.isSupported) {
      return false;
    }
    if (res.skipReason) {
      localLogger.info(
        {},
        `Google Spreadsheet document skipped with skip reason ${res.skipReason}`
      );
      skipReason = res.skipReason;
    }
  } else {
    await handleFileExport(
      oauth2client,
      documentId,
      file,
      maxDocumentLen,
      localLogger,
      dataSourceConfig,
      connectorId,
      startSyncTs
    );
  }
  await updateGoogleDriveFiles(
    connectorId,
    documentId,
    file,
    skipReason,
    upsertTimestampMs
  );

  return !skipReason;
}

async function syncOneFileTextDocument(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  localLogger: Logger,
  config: GoogleDriveConfig | null,
  dataSourceConfig: DataSourceConfig,
  startSyncTs: number,
  isBatchSync: boolean,
  maxDocumentLen: number
) {
  let documentContent: CoreAPIDataSourceDocumentSection | null = null;

  const mimeTypesToDownload = await getMimeTypesToDownload({
    pdfEnabled: config?.pdfEnabled || false,
    csvEnabled: config?.csvEnabled || false,
  });

  const documentId = getInternalId(file.id);

  if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
    documentContent = await handleGoogleDriveExport(
      oauth2client,
      file,
      localLogger
    );
  } else if (mimeTypesToDownload.includes(file.mimeType)) {
    documentContent = await handleFileExport(
      oauth2client,
      documentId,
      file,
      maxDocumentLen,
      localLogger,
      dataSourceConfig,
      connectorId,
      startSyncTs
    );
  }
  if (documentContent) {
    const upsertTimestampMs = await upsertGdriveDocument(
      dataSourceConfig,
      file,
      documentContent,
      documentId,
      maxDocumentLen,
      localLogger,
      oauth2client,
      connectorId,
      startSyncTs,
      isBatchSync
    );

    await updateGoogleDriveFiles(
      connectorId,
      documentId,
      file,
      undefined,
      upsertTimestampMs
    );
    return true;
  }
  return false;
}

async function upsertGdriveDocument(
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveObjectType,
  documentContent: CoreAPIDataSourceDocumentSection | null,
  documentId: string,
  maxDocumentLen: number,
  localLogger: Logger,
  oauth2client: OAuth2Client,
  connectorId: ModelId,
  startSyncTs: number,
  isBatchSync: boolean
): Promise<number | undefined> {
  const content = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: file.name,
    updatedAt: file.updatedAtMs ? new Date(file.updatedAtMs) : undefined,
    createdAt: file.createdAtMs ? new Date(file.createdAtMs) : undefined,
    lastEditor: file.lastEditor ? file.lastEditor.displayName : undefined,
    content: documentContent,
  });

  if (documentContent === undefined) {
    localLogger.error({}, "documentContent is undefined");
    throw new Error("documentContent is undefined");
  }

  const tags = [`title:${file.name}`];
  if (file.updatedAtMs) {
    tags.push(`updatedAt:${file.updatedAtMs}`);
  }
  if (file.createdAtMs) {
    tags.push(`createdAt:${file.createdAtMs}`);
  }
  if (file.lastEditor) {
    tags.push(`lastEditor:${file.lastEditor.displayName}`);
  }
  tags.push(`mimeType:${file.mimeType}`);

  const documentLen = documentContent ? sectionLength(documentContent) : 0;

  if (documentLen > 0 && documentLen <= maxDocumentLen) {
    const parentGoogleIds = await getFileParentsMemoized(
      connectorId,
      oauth2client,
      file,
      startSyncTs
    );

    const parents = parentGoogleIds.map((parent) => getInternalId(parent));

    await upsertDataSourceDocument({
      dataSourceConfig,
      documentId,
      documentContent: content,
      documentUrl: file.webViewLink,
      timestampMs: file.updatedAtMs,
      tags,
      // TODO(kw_search) remove legacy parentGoogleIds
      parents: [...parents, ...parentGoogleIds],
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
      title: file.name,
      mimeType: file.mimeType,
      async: true,
    });
    return file.updatedAtMs;
  } else {
    localLogger.info(
      { documentLen },
      "Document is empty or too big to be upserted. Skipping"
    );
    return undefined;
  }
}

async function updateGoogleDriveFiles(
  connectorId: ModelId,
  documentId: string,
  file: GoogleDriveObjectType,
  skipReason: string | undefined,
  upsertTimestampMs: number | undefined
): Promise<void> {
  const params: CreationAttributes<GoogleDriveFiles> = {
    connectorId,
    dustFileId: documentId,
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parentId: file.parent,
    lastSeenTs: new Date(),
    skipReason,
  };

  if (upsertTimestampMs) {
    params.lastUpsertedTs = new Date(upsertTimestampMs);
  }

  await GoogleDriveFiles.upsert(params);
}
