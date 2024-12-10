import type {
  CoreAPIDataSourceDocumentSection,
  ModelId,
  Result,
} from "@dust-tt/types";
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
  handleSpreadSheet,
} from "@connectors/connectors/microsoft/temporal/spreadsheets";
import {
  handleCsvFile,
  handleTextExtraction,
  handleTextFile,
} from "@connectors/connectors/shared/file";
import {
  deleteFolderNode,
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

  let result: Result<CoreAPIDataSourceDocumentSection | null, Error>;

  const resourceBlob: WithCreationAttributes<MicrosoftNodeModel> = {
    internalId: documentId,
    connectorId,
    lastSeenTs: new Date(),
    nodeType: "file",
    name: file.name ?? "",
    parentInternalId,
    mimeType: file.file.mimeType ?? "",
    webUrl: file.webUrl ?? "",
  };

  if (mimeType === "application/vnd.ms-excel" || mimeType === "text/csv") {
    const data = Buffer.from(downloadRes.data);

    const parents = [
      documentId,
      ...(await getParents({
        connectorId,
        internalId: parentInternalId,
        startSyncTs,
      })),
    ];

    result = await handleCsvFile({
      data,
      tableId: documentId,
      fileName: file.name || "",
      localLogger,
      maxDocumentLen,
      dataSourceConfig,
      provider: "microsoft",
      connectorId,
      parents,
    });

    if (result.isErr()) {
      if (fileResource) {
        await fileResource.delete();
      }
      return false;
    }

    if (fileResource) {
      await fileResource.update(resourceBlob);
    } else {
      await MicrosoftNodeResource.makeNew(resourceBlob);
    }

    return true;
  } else if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    result = await handleSpreadSheet({
      connectorId,
      file,
      parentInternalId,
      localLogger,
      startSyncTs,
    });

    if (result.isErr()) {
      if (fileResource) {
        await fileResource.delete();
      }
      return false;
    }

    // No insertion of fileResource here, as it is handled in handleSpreadSheet
    // For a spreadsheet with multiple tables, the spreadsheet needs to be
    // inserted before the tables so it cannot happen at the end as for other
    // files

    return true;
  } else {
    if (mimeType === "text/plain") {
      result = handleTextFile(downloadRes.data, maxDocumentLen);
    } else {
      const data = Buffer.from(downloadRes.data);
      result = await handleTextExtraction(data, localLogger, mimeType);
    }

    const updatedAt = file.lastModifiedDateTime
      ? new Date(file.lastModifiedDateTime)
      : undefined;

    const createdAt = file.createdDateTime
      ? new Date(file.createdDateTime)
      : undefined;

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

    if (result.isErr()) {
      if (fileResource) {
        await fileResource.delete();
      }
      return false;
    }

    const documentSection = result.value;
    if (documentSection) {
      const documentLength = sectionLength(documentSection);
      const isInSizeRange =
        documentLength > 0 && documentLength < maxDocumentLen;

      if (isInSizeRange) {
        localLogger.info({ documentSection }, "Document section");
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

        const upsertTimestampMs = updatedAt ? updatedAt.getTime() : undefined;

        const parents = [
          documentId,
          ...(await getParents({
            connectorId,
            internalId: parentInternalId,
            startSyncTs,
          })),
        ];

        await upsertToDatasource({
          dataSourceConfig,
          documentId,
          documentContent: content,
          documentUrl: file.webUrl ?? undefined,
          timestampMs: upsertTimestampMs,
          tags,
          parents,
          upsertContext: {
            sync_type: isBatchSync ? "batch" : "incremental",
          },
          title: file.name ?? "",
          mimeType: file.file.mimeType ?? "application/octet-stream",
          async: true,
        });

        resourceBlob.lastUpsertedTs = upsertTimestampMs
          ? new Date(upsertTimestampMs)
          : null;
      } else {
        localLogger.info(
          {
            documentLen: documentLength,
          },
          `Document is empty or too big to be upserted. Skipping.`
        );
        if (fileResource) {
          await fileResource.delete();
        }
        return false;
      }
    }

    if (fileResource) {
      await fileResource.update(resourceBlob);
    } else {
      await MicrosoftNodeResource.makeNew(resourceBlob);
    }

    return true;
  }
}

/**
 * Startsyncts is used to cache the parent ids for a given sync
 */
export async function getParents({
  connectorId,
  internalId,
  startSyncTs,
}: {
  connectorId: ModelId;
  internalId: string;
  startSyncTs: number;
}): Promise<string[]> {
  const parentInternalId = await getParentId(
    connectorId,
    internalId,
    startSyncTs
  );

  return parentInternalId
    ? [
        internalId,
        ...(await getParents({
          connectorId,
          internalId: parentInternalId,
          startSyncTs,
        })),
      ]
    : [internalId];
}

/* Fetching parent's parent id queries the db for a resource; since those
 * fetches can be made a lot of times during a sync, cache for a while in a
 * per-sync basis (given by startSyncTs) */
const getParentId = cacheWithRedis(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (connectorId: ModelId, internalId: string, startSyncTs: number) => {
    const node = await MicrosoftNodeResource.fetchByInternalId(
      connectorId,
      internalId
    );
    if (!node) {
      return "";
    }

    return node.parentInternalId;
  },
  (connectorId, internalId, startSyncTs) =>
    `microsoft-${connectorId}-parent-${internalId}-syncms-${startSyncTs}`,
  PARENT_SYNC_CACHE_TTL_MS
);

export async function deleteFolder({
  connectorId,
  dataSourceConfig,
  internalId,
}: {
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
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
    // Roots represent the user selection for synchronization As such, they
    // should be deleted first, explicitly by users, before deleting the
    // underlying folder
    throw new Error("Unexpected: attempt to delete folder with root node");
  }

  await deleteFolderNode({ dataSourceConfig, folderId: internalId });

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
): Promise<string[]> {
  const node = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    nodeId
  );
  const deletedFiles: string[] = [];

  if (!node) {
    logger.warn({ connectorId, nodeId }, "Node not found for deletion");
    return deletedFiles;
  }

  const { nodeType } = typeAndPathFromInternalId(nodeId);

  if (nodeType === "file") {
    try {
      await deleteFile({
        connectorId,
        dataSourceConfig,
        internalId: node.internalId,
      });
      deletedFiles.push(node.internalId);
    } catch (error) {
      logger.error(
        { connectorId, nodeId, error },
        `Failed to delete document ${node.internalId} from core data source`
      );
    }
  } else if (nodeType === "folder" || nodeType === "drive") {
    const children = await node.fetchChildren();
    for (const child of children) {
      const result = await recursiveNodeDeletion(
        child.internalId,
        connectorId,
        dataSourceConfig
      );
      deletedFiles.push(...result);
    }
    await deleteFolder({
      connectorId,
      dataSourceConfig,
      internalId: node.internalId,
    });
    deletedFiles.push(node.internalId);
  }

  return deletedFiles;
}
