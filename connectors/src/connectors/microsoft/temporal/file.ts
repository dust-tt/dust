import type {
  CoreAPIDataSourceDocumentSection,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { cacheWithRedis } from "@dust-tt/types";
import axios from "axios";

import { getClient } from "@connectors/connectors/microsoft";
import {
  getDriveItemInternalId,
  getFileDownloadURL,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { typeAndPathFromInternalId } from "@connectors/connectors/microsoft/lib/utils";
import { getMimeTypesToSync } from "@connectors/connectors/microsoft/temporal/mime_types";
import {
  deleteAllSheets,
  syncSpreadSheet,
} from "@connectors/connectors/microsoft/temporal/spreadsheets";
import {
  handleCsvFile,
  handleTextExtraction,
  handleTextFile,
} from "@connectors/connectors/shared/file";
import {
  deleteFromDataSource,
  MAX_DOCUMENT_TXT_LEN,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  MAX_LARGE_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  sectionLength,
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

const PARENT_SYNC_CACHE_TTL_MS = 30 * 60 * 1000;

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
    internalId: documentId,
    originalId: file.id,
    name: file.name,
  });

  const fileResource = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    documentId
  );

  if (
    fileResource &&
    isAlreadySeenItem({
      driveItemResource: fileResource,
      startSyncTs,
    })
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

  localLogger.info("Syncing file");

  const url =
    "@microsoft.graph.downloadUrl" in file
      ? file["@microsoft.graph.downloadUrl"]
      : await getFileDownloadURL(
          await getClient(connector.connectionId),
          documentId
        );

  if (!url) {
    localLogger.error("Unexpected missing download URL");
    throw new Error("Unexpected missing download URL");
  }

  // If the file is too big to be downloaded, we skip it.
  if (file.size && file.size > MAX_FILE_SIZE_TO_DOWNLOAD) {
    localLogger.info("File size exceeded, skipping file.");

    return false;
  }

  const mimeTypesToSync = await getMimeTypesToSync({
    pdfEnabled: providerConfig.pdfEnabled || false,
    csvEnabled: providerConfig.csvEnabled || false,
  });

  const mimeType = file.file.mimeType;
  if (!mimeType || !mimeTypesToSync.includes(mimeType)) {
    localLogger.info("Type not supported, skipping file.");
    return false;
  }

  const maxDocumentLen = providerConfig.largeFilesEnabled
    ? MAX_LARGE_DOCUMENT_TXT_LEN
    : MAX_DOCUMENT_TXT_LEN;

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

  let documentSection: CoreAPIDataSourceDocumentSection | null = null;

  if (mimeType === "application/vnd.ms-excel" || mimeType === "text/csv") {
    const data = Buffer.from(downloadRes.data);
    const isSuccessful = await handleCsvFile({
      dataSourceConfig,
      data,
      file,
      localLogger,
      maxDocumentLen,
      connectorId,
    });
    if (isSuccessful) {
      documentSection = null;
    } else {
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
      }
    }
  } else if (mimeType === "text/plain") {
    documentSection = handleTextFile(downloadRes.data, maxDocumentLen);
  } else {
    const data = Buffer.from(downloadRes.data);
    documentSection = await handleTextExtraction(data, localLogger, mimeType);
  }

  localLogger.info({ documentSection }, "Document section");

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
    createdAt,
    lastEditor: file.lastModifiedBy?.user
      ? file.lastModifiedBy.user.displayName ?? undefined
      : undefined,
    content: documentSection,
  });

  if (documentSection === undefined) {
    localLogger.error({}, "documentContent is undefined");
    throw new Error("documentContent is undefined");
  }

  const tags = [`title:${file.name}`];

  if (file.lastModifiedDateTime) {
    tags.push(`updatedAt:${file.lastModifiedDateTime}`);
  }

  if (file.createdDateTime) {
    tags.push(`createdAt:${file.createdDateTime}`);
  }

  if (file.lastModifiedBy?.user?.displayName) {
    tags.push(`lastEditor:${file.lastModifiedBy.user.displayName}`);
  }

  tags.push(`mimeType:${file.file.mimeType}`);

  const documentLength = documentSection ? sectionLength(documentSection) : 0;

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
      {
        documentLen: documentLength,
      },
      `Document is empty or too big to be upserted (marking as synced without upserting)`
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
    lastUpsertedTs:
      isInSizeRange && upsertTimestampMs ? new Date(upsertTimestampMs) : null,
  };

  if (fileResource) {
    await fileResource.update(resourceBlob);
  } else {
    await MicrosoftNodeResource.makeNew(resourceBlob);
  }

  return isInSizeRange;
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

  return parentParentInternalId
    ? [
        internalId,
        ...(await getParents({
          connectorId,
          internalId: parentInternalId,
          parentInternalId: parentParentInternalId,
          startSyncTs,
        })),
      ]
    : [internalId, parentInternalId];
}

/* Fetching parent's parent id queries the db for a resource; since those
 * fetches can be made a lot of times during a sync, cache for a while in a
 * per-sync basis (given by startSyncTs) */
const getParentParentId = cacheWithRedis(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (connectorId, parentInternalId, startSyncTs) => {
    const parent = await MicrosoftNodeResource.fetchByInternalId(
      connectorId,
      parentInternalId
    );
    if (!parent) {
      return "";
    }

    return parent.parentInternalId;
  },
  (connectorId, parentInternalId, startSyncTs) =>
    `microsoft-${connectorId}-parent-${parentInternalId}-syncms-${startSyncTs}`,
  PARENT_SYNC_CACHE_TTL_MS
);

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
    file.mimeType === "application/vnd.ms-excel" ||
    file.mimeType === "text/csv"
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

export async function recursiveNodeDeletion(
  nodeId: string,
  connectorId: ModelId,
  dataSourceConfig: DataSourceConfig
): Promise<Result<void, Error>> {
  const node = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    nodeId
  );

  if (!node) {
    logger.warn({ connectorId, nodeId }, "Node not found for deletion");
    return new Ok(undefined);
  }

  const { nodeType } = typeAndPathFromInternalId(nodeId);

  if (nodeType === "file") {
    try {
      await deleteFile({
        connectorId,
        dataSourceConfig,
        internalId: node.internalId,
      });
    } catch (error) {
      logger.error(
        { connectorId, nodeId, error },
        `Failed to delete document ${node.internalId} from core data source`
      );
      return new Err(new Error(`Failed to delete document ${node.internalId}`));
    }
  } else if (nodeType === "folder" || nodeType === "drive") {
    const children = await node.fetchChildren();
    for (const child of children) {
      const result = await recursiveNodeDeletion(
        child.internalId,
        connectorId,
        dataSourceConfig
      );
      if (result.isErr()) {
        logger.error(
          { connectorId, nodeId: child.internalId, error: result.error },
          `Failed to delete child node`
        );
        return result;
      }
    }
    await deleteFolder({
      connectorId,
      internalId: node.internalId,
    });
  }

  try {
    const root = await MicrosoftRootResource.fetchByInternalId(
      connectorId,
      nodeId
    );
    if (root) {
      await root.delete();
    }
  } catch (error) {
    logger.error(
      { connectorId, nodeId, error },
      `Failed to delete node ${nodeId}`
    );
    return new Err(new Error(`Failed to delete node ${nodeId}`));
  }

  return new Ok(undefined);
}
