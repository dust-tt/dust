import type { CoreAPIDataSourceDocumentSection, ModelId } from "@dust-tt/types";
import { slugify, TextExtraction } from "@dust-tt/types";
import tracer from "dd-trace";
import type { OAuth2Client } from "googleapis-common";
import type { CreationAttributes } from "sequelize";

import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getMimeTypesToDownload,
  isGoogleDriveSpreadSheetFile,
  MIME_TYPES_TO_EXPORT,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import { syncSpreadSheet } from "@connectors/connectors/google_drive/temporal/spreadsheets";
import {
  getDocumentId,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { apiConfig } from "@connectors/lib/api/config";
import {
  MAX_FILE_SIZE_TO_DOWNLOAD,
  upsertTableFromCsv,
} from "@connectors/lib/data_sources";
import {
  MAX_DOCUMENT_TXT_LEN,
  MAX_LARGE_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  sectionLength,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
} from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

const pagePrefixesPerMimeType: Record<string, string> = {
  "application/pdf": "$pdfPage",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "$slideNumber",
};

async function handleGoogleDocExport(
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
    localLogger.error({}, "Error exporting Google document");
    throw e;
  }
}

async function handleFileDownload(
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  maxDocumentLen: number,
  localLogger: Logger,
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId
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

  switch (file.mimeType) {
    case "text/plain":
      return handleTextFile(res.data, maxDocumentLen);
    case "application/pdf":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return handleTextExtraction(res.data, localLogger, file);
    case "text/csv":
      return handleCsvFile(
        res.data,
        file,
        maxDocumentLen,
        localLogger,
        dataSourceConfig,
        connectorId
      );
    default:
      return null;
  }
}

function handleTextFile(
  data: ArrayBuffer,
  maxDocumentLen: number
): CoreAPIDataSourceDocumentSection | null {
  if (data.byteLength > 4 * maxDocumentLen) {
    return null;
  }
  return {
    prefix: null,
    content: Buffer.from(data).toString("utf-8").trim(),
    sections: [],
  };
}

async function handleTextExtraction(
  data: ArrayBuffer,
  localLogger: Logger,
  file: GoogleDriveObjectType
): Promise<CoreAPIDataSourceDocumentSection | null> {
  const pageRes = await new TextExtraction(
    apiConfig.getTextExtractionUrl()
  ).fromBuffer(Buffer.from(data), file.mimeType);
  if (pageRes.isErr()) {
    localLogger.warn(
      {
        error: pageRes.error,
        mimeType: file.mimeType,
      },
      "Error while converting file to text"
    );
    // We don't know what to do with files that fails to be converted to text.
    // So we log the error and skip the file.
    return null;
  }
  const pages = pageRes.value;
  const prefix = pagePrefixesPerMimeType[file.mimeType];
  return pages.length > 0
    ? {
        prefix: null,
        content: null,
        sections: pages.map((page) => ({
          prefix: prefix
            ? `\n${prefix}: ${page.pageNumber}/${pages.length}\n`
            : null,
          content: page.content,
          sections: [],
        })),
      }
    : null;
}

async function handleCsvFile(
  data: ArrayBuffer,
  file: GoogleDriveObjectType,
  maxDocumentLen: number,
  localLogger: Logger,
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId
): Promise<CoreAPIDataSourceDocumentSection | null> {
  if (data.byteLength > 4 * maxDocumentLen) {
    localLogger.info({}, "File too big to be chunked. Skipping");
    return null;
  }

  const tableCsv = Buffer.from(data).toString("utf-8").trim();
  const tableId = file.id;
  const tableName = slugify(file.name.substring(0, 32));
  const tableDescription = `Structured data from Google Drive (${file.name})`;

  try {
    await upsertTableFromCsv({
      dataSourceConfig,
      tableId,
      tableName,
      tableDescription,
      tableCsv,
      loggerArgs: {
        connectorId,
        fileId: tableId,
        fileName: tableName,
      },
      truncate: true,
    });
  } catch (err) {
    localLogger.warn({ error: err }, "Error while upserting table");
    return null;
  }

  return null;
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

      const config = await GoogleDriveConfig.findOne({
        where: {
          connectorId,
        },
      });
      const maxDocumentLen = config?.largeFilesEnabled
        ? MAX_LARGE_DOCUMENT_TXT_LEN
        : MAX_DOCUMENT_TXT_LEN;

      const mimeTypesToDownload = getMimeTypesToDownload({
        pdfEnabled: config?.pdfEnabled || false,
      });

      const documentId = getDocumentId(file.id);
      const fileInDb = await GoogleDriveFiles.findOne({
        where: { connectorId, driveFileId: file.id },
      });

      const localLogger = logger.child({
        provider: "google_drive",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
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

      let documentContent: CoreAPIDataSourceDocumentSection | null = null;
      let skipReason: string | undefined;

      if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
        documentContent = await handleGoogleDocExport(
          oauth2client,
          file,
          localLogger
        );
      } else if (mimeTypesToDownload.includes(file.mimeType)) {
        documentContent = await handleFileDownload(
          oauth2client,
          file,
          maxDocumentLen,
          localLogger,
          dataSourceConfig,
          connectorId
        );
      } else if (isGoogleDriveSpreadSheetFile(file)) {
        const res = await syncSpreadSheet(oauth2client, connectorId, file);
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
        return false;
      }

      if (!documentContent) {
        return false;
      }

      let upsertTimestampMs: number | undefined;

      if (!isGoogleDriveSpreadSheetFile(file) || file.mimeType === "text/csv") {
        upsertTimestampMs = await upsertDocument(
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
      }

      await updateGoogleDriveFiles(
        connectorId,
        documentId,
        file,
        skipReason,
        upsertTimestampMs
      );

      return !!upsertTimestampMs;
    }
  );
}

async function upsertDocument(
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
    const parents = (
      await getFileParentsMemoized(connectorId, oauth2client, file, startSyncTs)
    ).map((f) => f.id);
    parents.push(file.id);
    parents.reverse();

    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentContent: content,
      documentUrl: file.webViewLink,
      timestampMs: file.updatedAtMs,
      tags,
      parents,
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
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
