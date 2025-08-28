import type { Result } from "@dust-tt/client";
import axios from "axios";

import { getClient } from "@connectors/connectors/microsoft";
import {
  getDriveItemInternalId,
  getItem,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import { DRIVE_ITEM_EXPANDS_AND_SELECTS } from "@connectors/connectors/microsoft/lib/types";
import {
  getColumnsFromListItem,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
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
import { filterCustomTags } from "@connectors/connectors/shared/tags";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  MAX_DOCUMENT_TXT_LEN,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  MAX_LARGE_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  sectionLength,
  updateDataSourceDocumentParents,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import type { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import { heartbeat } from "@connectors/lib/temporal";
import logger, { getActivityLogger } from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import type { WithCreationAttributes } from "@connectors/resources/connector/strategy";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { MicrosoftConfigurationResource } from "@connectors/resources/microsoft_resource";
import {
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import {
  cacheWithRedis,
  concurrentExecutor,
  INTERNAL_MIME_TYPES,
  WithRetriesError,
} from "@connectors/types";

const PARENT_SYNC_CACHE_TTL_MS = 30 * 60 * 1000;

export async function syncOneFile({
  connectorId,
  dataSourceConfig,
  providerConfig,
  file,
  parentInternalId,
  startSyncTs,
  isBatchSync = false,
  heartbeat,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  providerConfig: MicrosoftConfigurationResource;
  file: DriveItem;
  parentInternalId: string;
  startSyncTs: number;
  isBatchSync?: boolean;
  heartbeat: () => Promise<void>;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  if (!file.file) {
    throw new Error(`Item is not a file: ${JSON.stringify(file)}`);
  }

  const documentId = getDriveItemInternalId(file);
  const localLogger = getActivityLogger(connector, {
    internalId: documentId,
    originalId: file.id || null,
    name: file.name || null,
  });

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
    return false;
  }

  if (fileResource?.skipReason) {
    localLogger.info(
      { skipReason: fileResource.skipReason },
      "Skipping file sync"
    );
    return false;
  }

  localLogger.info("Syncing file");
  await heartbeat();

  const client = await getClient(connector.connectionId);
  const { itemAPIPath } = typeAndPathFromInternalId(documentId);

  let url = file["@microsoft.graph.downloadUrl"];
  let fields = file.listItem?.fields;

  if (!url || !fields) {
    if (!url) {
      statsDClient.increment("microsoft.file.missing_download_url");
    }
    if (!fields) {
      statsDClient.increment("microsoft.file.missing_fields");
    }

    const item = (await getItem(
      logger,
      client,
      `${itemAPIPath}?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`
    )) as DriveItem;

    url = item["@microsoft.graph.downloadUrl"];
    fields = item.listItem?.fields;
  }

  if (!url) {
    localLogger.error("Unexpected missing download URL");
    throw new Error("Unexpected missing download URL");
  }

  if (!fields) {
    localLogger.warn("Unexpected missing fields for file");
  }

  const maxDocumentLen = providerConfig.largeFilesEnabled
    ? MAX_LARGE_DOCUMENT_TXT_LEN
    : MAX_DOCUMENT_TXT_LEN;

  let downloadRes;
  try {
    downloadRes = await axios.get(`${url}`, {
      responseType: "arraybuffer",
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      localLogger.info(
        {
          status: 403,
          fileName: file.name,
          internalId: documentId,
          webUrl: file.webUrl,
        },
        "Access forbidden to file, marking as skipped"
      );

      // Save the skipReason to the database
      const resourceBlob: WithCreationAttributes<MicrosoftNodeModel> = {
        internalId: documentId,
        connectorId,
        lastSeenTs: new Date(),
        nodeType: "file",
        name: file.name ?? "",
        parentInternalId,
        mimeType: file.file.mimeType ?? "",
        webUrl: file.webUrl ?? null,
        skipReason: "access_forbidden",
      };

      if (fileResource) {
        await fileResource.update(resourceBlob);
      } else {
        await MicrosoftNodeResource.makeNew(resourceBlob);
      }

      return false;
    }

    // Re-throw other errors
    throw error;
  }

  if (downloadRes.status !== 200) {
    localLogger.error(
      `Error while downloading file ${file.name}: ${downloadRes.status}`
    );
    throw new Error(
      `Error while downloading file ${file.name}: ${downloadRes.status}`
    );
  }

  // Handle custom columns (metadata) potentially set on the file
  const columns = await getColumnsFromListItem(
    file,
    fields,
    client,
    localLogger
  );

  let result: Result<CoreAPIDataSourceDocumentSection | null, Error>;

  const resourceBlob: WithCreationAttributes<MicrosoftNodeModel> = {
    internalId: documentId,
    connectorId,
    lastSeenTs: new Date(),
    nodeType: "file",
    name: file.name ?? "",
    parentInternalId,
    mimeType: file.file.mimeType ?? "",
    webUrl: file.webUrl ?? null,
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
      tags: columns,
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
      heartbeat,
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
    if (mimeType === "text/plain" || mimeType === "text/markdown") {
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

    const tags = file.name ? [`title:${file.name}`] : [];

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

    tags.push(...filterCustomTags(columns, localLogger));

    if (result.isErr()) {
      localLogger.error({ error: result.error }, "Could not handle file.");
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
        const content = await renderDocumentTitleAndContent({
          dataSourceConfig,
          title: file.name ?? null,
          updatedAt,
          createdAt,
          lastEditor: file.lastModifiedBy?.user
            ? file.lastModifiedBy.user.displayName ?? undefined
            : undefined,
          content: documentSection,
          additionalPrefixes: {
            columns: columns.join(", "),
          },
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

        try {
          await upsertDataSourceDocument({
            dataSourceConfig,
            documentId,
            documentContent: content,
            documentUrl: file.webUrl ?? undefined,
            timestampMs: upsertTimestampMs,
            tags,
            parents,
            parentId: parents[1] || null,
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
        } catch (error) {
          if (
            error instanceof WithRetriesError &&
            error.errors.every(
              ({ error }) =>
                axios.isAxiosError(error) && error.response?.status === 413
            )
          ) {
            localLogger.info(
              {
                status: 413,
                fileName: file.name,
                internalId: documentId,
                webUrl: file.webUrl,
                documentLen: documentLength,
              },
              "Document too large for upsert, marking as skipped"
            );

            resourceBlob.skipReason = "payload_too_large";

            if (fileResource) {
              await fileResource.update(resourceBlob);
            } else {
              await MicrosoftNodeResource.makeNew(resourceBlob);
            }

            return false;
          }

          // Re-throw other errors
          throw error;
        }
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
}): Promise<[string, ...string[]]> {
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
  {
    ttlMs: PARENT_SYNC_CACHE_TTL_MS,
  }
);

export async function deleteFolder({
  connectorId,
  dataSourceConfig,
  internalId,
  deleteRootNode,
}: {
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  internalId: string;
  deleteRootNode?: boolean;
}) {
  const folder = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    internalId
  );

  if (!folder) {
    return false;
  }

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
    if (deleteRootNode) {
      await root.delete();
    } else {
      throw new Error("Unexpected: attempt to delete folder with root node");
    }
  }

  await deleteDataSourceFolder({ dataSourceConfig, folderId: internalId });

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
    return false;
  }

  logger.info({ connectorId, file }, `Deleting Microsoft file.`);

  if (
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimeType === "application/vnd.ms-excel" ||
    file.mimeType === "text/csv"
  ) {
    await deleteAllSheets(dataSourceConfig, file);
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: file.internalId,
    });
  } else {
    await deleteDataSourceDocument(dataSourceConfig, internalId);
  }

  const deletedRes = await file.delete();

  return deletedRes.isOk();
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

export async function recursiveNodeDeletion({
  nodeId,
  connectorId,
  dataSourceConfig,
}: {
  nodeId: string;
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
}): Promise<string[]> {
  await heartbeat();
  const node = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    nodeId
  );

  if (!node) {
    logger.warn({ connectorId, nodeId }, "Node not found for deletion");
    return [];
  }

  // A folder should not be deleted if it is marked as root, i.e. if the user selected it for sync
  // recursiveNodeDeletion must therefore skip root nodes, rather than throwing:
  // for instance, if a non-root folder A is moved out of sync, but has a child B that is a root,
  // then we should recursively delete A, but not delete the child B
  const root = await MicrosoftRootResource.fetchByInternalId(
    connectorId,
    nodeId
  );

  if (root) {
    // If the node is now a root, we need to update the parentInternalId to null
    // and update the descendants parents in core
    await node.update({
      parentInternalId: null,
    });

    await updateDescendantsParentsInCore({
      folder: node,
      dataSourceConfig,
      startSyncTs: new Date().getTime(),
    });

    return [];
  }

  const deletedFiles: string[] = [];

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
      const result = await recursiveNodeDeletion({
        nodeId: child.internalId,
        connectorId,
        dataSourceConfig,
      });
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

export async function updateDescendantsParentsInCore({
  folder,
  dataSourceConfig,
  startSyncTs,
}: {
  folder: MicrosoftNodeResource;
  dataSourceConfig: DataSourceConfig;
  startSyncTs: number;
}) {
  const children = await folder.fetchChildren();
  const files = children.filter((child) => child.nodeType === "file");
  const folders = children.filter((child) => child.nodeType === "folder");

  const parents = await getParents({
    connectorId: folder.connectorId,
    internalId: folder.internalId,
    startSyncTs,
  });
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: folder.internalId,
    parents,
    parentId: parents[1] || null,
    title: folder.name ?? "Untitled Folder",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
    sourceUrl: folder.webUrl ?? undefined,
  });

  await concurrentExecutor(
    files,
    async (file) => updateParentsField({ file, dataSourceConfig, startSyncTs }),
    {
      concurrency: 10,
    }
  );
  for (const childFolder of folders) {
    await updateDescendantsParentsInCore({
      dataSourceConfig,
      folder: childFolder,
      startSyncTs,
    });
  }
}

async function updateParentsField({
  file,
  dataSourceConfig,
  startSyncTs,
}: {
  file: MicrosoftNodeResource;
  dataSourceConfig: DataSourceConfig;
  startSyncTs: number;
}) {
  const parents = await getParents({
    connectorId: file.connectorId,
    internalId: file.internalId,
    startSyncTs,
  });

  await updateDataSourceDocumentParents({
    dataSourceConfig,
    documentId: file.internalId,
    parents,
    parentId: parents[1] || null,
  });
}
