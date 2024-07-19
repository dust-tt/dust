import type { CoreAPIDataSourceDocumentSection, ModelId } from "@dust-tt/types";
import {
  cacheWithRedis,
  isTextExtractionSupportedContentType,
  parseAndStringifyCsv,
  slugify,
  TextExtraction,
} from "@dust-tt/types";
import type { DriveItem } from "@microsoft/microsoft-graph-types";
import type { AxiosResponse } from "axios";
import axios from "axios";
import mammoth from "mammoth";
import type { Logger } from "pino";
import turndown from "turndown";

import { getDriveItemInternalId } from "@connectors/connectors/microsoft/lib/graph_api";
import {
  getMimeTypesToSync,
  MIME_TYPES_TIKA,
} from "@connectors/connectors/microsoft/temporal/mime_types";
import {
  deleteAllSheets,
  syncSpreadSheet,
} from "@connectors/connectors/microsoft/temporal/spreadsheets";
import { apiConfig } from "@connectors/lib/api/config";
import {
  deleteFromDataSource,
  MAX_DOCUMENT_TXT_LEN,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  MAX_LARGE_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  sectionLength,
  upsertTableFromCsv,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import type { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import logger from "@connectors/logger/logger";
import type { WithCreationAttributes } from "@connectors/resources/connector/strategy";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { MicrosoftConfigurationResource } from "@connectors/resources/microsoft_resource";
import {
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const PARENT_SYNC_CACHE_TTL_MS = 10 * 60 * 1000;

const pagePrefixesPerMimeType: Record<string, string> = {
  "application/pdf": "$pdfPage",
};

export async function syncOneFile({
  connectorId,
  dataSourceConfig,
  providerConfig,
  file,
  parentInternalId,
  startSyncTs,
  isBatchSync = false,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  providerConfig: MicrosoftConfigurationResource;
  file: microsoftgraph.DriveItem;
  parentInternalId: string;
  startSyncTs: number;
  isBatchSync?: boolean;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  if (!file.file) {
    throw new Error(`Item is not a file: ${JSON.stringify(file)}`);
  }

  const documentId = getDriveItemInternalId(file);

  const localLogger = logger.child({
    provider: "microsoft",
    connectorId,
    internalId: file.id,
    name: file.name,
  });

  const fileResource = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    documentId
  );

  // Early return if lastSeenTs is greater than workflow start.
  // This allows avoiding resyncing already-synced documents in case of activity failure
  if (
    fileResource?.lastSeenTs &&
    fileResource.lastSeenTs > new Date(startSyncTs)
  ) {
    return true;
  }

  if (fileResource?.skipReason) {
    localLogger.info(
      { skipReason: fileResource.skipReason },
      "Skipping file sync"
    );
    return false;
  }

  const url =
    "@microsoft.graph.downloadUrl" in file
      ? file["@microsoft.graph.downloadUrl"]
      : null;
  if (!url) {
    localLogger.error("Unexpected missing download URL");
    throw new Error("Unexpected missing download URL");
  }

  // If the file is too big to be downloaded, we skip it.
  if (file.size && file.size > MAX_FILE_SIZE_TO_DOWNLOAD) {
    localLogger.info("File size exceeded, skipping file.");
    return false;
  }

  const mimeType = file.file.mimeType ?? undefined;
  if (
    !mimeType ||
    !(await shouldSyncMimeType(providerConfig, connector, mimeType))
  ) {
    localLogger.info("Type not supported, skipping file.");
    return false;
  }

  const maxDocumentLen = providerConfig.largeFilesEnabled
    ? MAX_LARGE_DOCUMENT_TXT_LEN
    : MAX_DOCUMENT_TXT_LEN;

  const downloadRes = await downloadFile(`${url}`, file, localLogger);

  let documentSection: CoreAPIDataSourceDocumentSection | null = null;
  if (MIME_TYPES_TIKA.includes(mimeType)) {
    const data = Buffer.from(downloadRes.data);
    documentSection = await handleTextExtraction(data, localLogger, file);
  } else if (mimeType === "application/vnd.ms-excel") {
    const data = Buffer.from(downloadRes.data);
    const isSuccessful = await handleCsvFile(
      dataSourceConfig,
      data,
      file,
      localLogger,
      maxDocumentLen,
      connectorId
    );
    if (!isSuccessful) {
      return false;
    }
  } else if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const res = await syncSpreadSheet({
      connectorId,
      file,
      parentInternalId,
    });
    if (!res.isSupported) {
      return false;
    } else {
      if (res.skipReason) {
        localLogger.info(
          {},
          `Microsoft Spreadsheet document skipped with skip reason ${res.skipReason}`
        );
        return true;
      }
    }
  } else if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const documentContent = await getDocumentContent(downloadRes, localLogger);
    documentSection = {
      prefix: null,
      content: documentContent,
      sections: [],
    };
  } else if (mimeType === "text/plain") {
    const data = Buffer.from(downloadRes.data);
    documentSection = handleTextFile(data, maxDocumentLen);
  } else {
    return false;
  }

  logger.info({ documentSection }, "Document section");

  let upsertTimestampMs: number | undefined;
  if (
    !(
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel"
    )
  ) {
    upsertTimestampMs = await upsertDocument(
      dataSourceConfig,
      file,
      documentSection,
      documentId,
      maxDocumentLen,
      localLogger,
      connectorId,
      startSyncTs,
      isBatchSync,
      parentInternalId
    );
  }

  const resourceBlob: WithCreationAttributes<MicrosoftNodeModel> = {
    internalId: documentId,
    connectorId,
    lastSeenTs: new Date(),
    nodeType: "file",
    name: file.name ?? "",
    parentInternalId,
    mimeType: file.file.mimeType ?? "",
    lastUpsertedTs: upsertTimestampMs ? new Date(upsertTimestampMs) : null,
  };

  if (fileResource) {
    await fileResource.update(resourceBlob);
  } else {
    await MicrosoftNodeResource.makeNew(resourceBlob);
  }
  return !!upsertTimestampMs;
}

async function shouldSyncMimeType(
  providerConfig: MicrosoftConfigurationResource,
  connector: ConnectorResource,
  mimeType?: string
): Promise<boolean> {
  if (!mimeType) {
    return false;
  }
  const mimeTypesToSync = await getMimeTypesToSync({
    pdfEnabled: providerConfig.pdfEnabled || false,
    connector,
  });

  return mimeTypesToSync.includes(mimeType);
}

async function downloadFile(
  url: string,
  file: microsoftgraph.DriveItem,
  localLogger: Logger
) {
  const downloadRes = await axios.get(`${url}`, {
    responseType: "arraybuffer",
  });

  if (downloadRes.status !== 200) {
    localLogger.error(
      `Error while downloading file ${file.name}: ${downloadRes.status}`
    );
    throw new Error(
      `Error while downloading file ${file.name}: ${downloadRes.status}`
    );
  }
  return downloadRes;
}

async function getDocumentContent(
  downloadRes: AxiosResponse,
  localLogger: Logger
) {
  try {
    const converted = await mammoth.convertToHtml({
      buffer: Buffer.from(downloadRes.data),
    });

    const extracted = new turndown()
      .remove(["style", "script", "iframe", "noscript", "form", "img"])
      .turndown(converted.value);

    return extracted.trim();
  } catch (err) {
    localLogger.error(
      {
        error: err,
      },
      `Error while converting docx document to text`
    );
    throw err;
  }
}

async function handleCsvFile(
  dataSourceConfig: DataSourceConfig,
  data: ArrayBuffer,
  file: DriveItem,
  localLogger: Logger,
  maxDocumentLen: number,
  connectorId: ModelId
): Promise<boolean> {
  if (data.byteLength > 4 * maxDocumentLen) {
    localLogger.info({}, "File too big to be chunked. Skipping");
    return false;
  }
  const fileName = file.name ?? "";

  const tableCsv = Buffer.from(data).toString("utf-8").trim();
  const tableId = file.id ?? "";
  const tableName = slugify(fileName.substring(0, 32));
  const tableDescription = `Structured data from Microsoft (${fileName})`;
  const stringifiedContent = await parseAndStringifyCsv(tableCsv);
  try {
    await upsertTableFromCsv({
      dataSourceConfig,
      tableId,
      tableName,
      tableDescription,
      tableCsv: stringifiedContent,
      loggerArgs: {
        connectorId,
        fileId: tableId,
        fileName: tableName,
      },
      truncate: true,
    });
  } catch (err) {
    localLogger.warn({ error: err }, "Error while upserting table");
    return false;
  }
  return true;
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

export async function getParents({
  connectorId,
  internalId,
  parentInternalId,
  startSyncTs,
}: {
  connectorId: ModelId;
  internalId: string;
  parentInternalId: string | null;
  startSyncTs: number;
}): Promise<string[]> {
  if (!parentInternalId) {
    return [internalId];
  }

  const parentParentInternalId = await getParentParentId(
    connectorId,
    parentInternalId,
    startSyncTs
  );

  return [
    internalId,
    ...(await getParents({
      connectorId,
      internalId: parentInternalId,
      parentInternalId: parentParentInternalId,
      startSyncTs,
    })),
  ];
}

/* Fetching parent's parent id queries the db for a resource; since those
 * fetches can be made a lot of times during a sync, cache for 10mins in a
 * per-sync basis (given by startSyncTs) */
const getParentParentId = cacheWithRedis(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (connectorId, parentInternalId, startSyncTs) => {
    const parent = await MicrosoftNodeResource.fetchByInternalId(
      connectorId,
      parentInternalId
    );
    if (!parent) {
      throw new Error(`Parent node not found: ${parentInternalId}`);
    }

    return parent.parentInternalId;
  },
  (connectorId, parentInternalId, startSyncTs) =>
    `microsoft-${connectorId}-parent-${parentInternalId}-syncms-${startSyncTs}`,
  PARENT_SYNC_CACHE_TTL_MS
);

async function handleTextExtraction(
  data: ArrayBuffer,
  localLogger: Logger,
  file: DriveItem
): Promise<CoreAPIDataSourceDocumentSection | null> {
  const mimeType = file.file?.mimeType;

  if (!mimeType || !isTextExtractionSupportedContentType(mimeType)) {
    localLogger.warn(
      {
        error: "Unexpected mimeType",
        mimeType: mimeType,
      },
      "Unexpected mimeType"
    );
    return null;
  }
  const pageRes = await new TextExtraction(
    apiConfig.getTextExtractionUrl()
  ).fromBuffer(Buffer.from(data), mimeType);
  if (pageRes.isErr()) {
    localLogger.error(
      {
        error: pageRes.error,
        mimeType: mimeType,
      },
      "Error while converting file to text"
    );
    // We don't know what to do with files that fails to be converted to text.
    // So we log the error and skip the file.
    return null;
  }
  const pages = pageRes.value;
  const prefix = pagePrefixesPerMimeType[mimeType];
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

async function upsertDocument(
  dataSourceConfig: DataSourceConfig,
  file: microsoftgraph.DriveItem,
  documentContent: CoreAPIDataSourceDocumentSection | null,
  documentId: string,
  maxDocumentLen: number,
  localLogger: Logger,
  connectorId: ModelId,
  startSyncTs: number,
  isBatchSync: boolean,
  parentInternalId: string
): Promise<number | undefined> {
  const updatedAt = file.lastModifiedDateTime
    ? new Date(file.lastModifiedDateTime)
    : undefined;

  const createdAt = file.createdDateTime
    ? new Date(file.createdDateTime)
    : undefined;

  const content = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: file.name ?? null,
    updatedAt,
    createdAt: createdAt,
    lastEditor: file.lastModifiedBy?.user?.displayName ?? undefined,
    content: documentContent,
  });

  if (documentContent === undefined) {
    localLogger.error({}, "documentContent is undefined");
    throw new Error("documentContent is undefined");
  }

  const tags = [`title:${file.name}`];
  if (updatedAt) {
    tags.push(`updatedAt:${updatedAt}`);
  }
  if (file.createdDateTime) {
    tags.push(`createdAt:${file.createdDateTime}`);
  }
  if (file.lastModifiedBy?.user?.displayName) {
    tags.push(`lastEditor:${file.lastModifiedBy.user.displayName}`);
  }

  tags.push(`mimeType:${file.file?.mimeType}`);

  const documentLength = documentContent ? sectionLength(documentContent) : 0;
  const upsertTimestampMs = updatedAt ? updatedAt.getTime() : undefined;
  const isInSizeRange = documentLength > 0 && documentLength < maxDocumentLen;
  if (isInSizeRange) {
    const parents = await getParents({
      connectorId,
      internalId: documentId,
      parentInternalId,
      startSyncTs,
    });
    parents.reverse();

    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentContent: content,
      documentUrl: file.webUrl ?? undefined,
      timestampMs: upsertTimestampMs,
      tags,
      parents: parents,
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
      async: true,
    });
  } else {
    localLogger.info(
      { documentLength },
      "Document is empty or too big to be upserted. Skipping"
    );
    return undefined;
  }
}

export async function deleteFolder({
  connectorId,
  internalId,
}: {
  connectorId: number;
  internalId: string;
}) {
  const folder = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    internalId
  );

  logger.info(
    {
      connectorId,
      folder,
    },
    `Deleting Microsoft folder.`
  );

  const root = await MicrosoftRootResource.fetchByInternalId(
    connectorId,
    internalId
  );

  if (root) {
    await root.delete();
  }

  if (folder) {
    await folder.delete();
  }
}

export async function deleteFile({
  connectorId,
  dataSourceConfig,
  internalId,
}: {
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  internalId: string;
}) {
  const file = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    internalId
  );

  if (!file) {
    return;
  }

  logger.info({ connectorId, file }, `Deleting Microsoft file.`);

  if (
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimeType === "application/vnd.ms-excel"
  ) {
    await deleteAllSheets(dataSourceConfig, file);
  } else {
    await deleteFromDataSource(dataSourceConfig, internalId);
  }
  return file.delete();
}

export function isAlreadySeenItem({
  driveItemResource,
  startSyncTs,
}: {
  driveItemResource: MicrosoftNodeResource;
  startSyncTs: number;
}) {
  return (
    driveItemResource.lastSeenTs &&
    // if lastSeenTs is greater than workflow start time, document was seen already
    // e.g. because of an incremental sync or because an activity was retried
    driveItemResource.lastSeenTs > new Date(startSyncTs)
  );
}
