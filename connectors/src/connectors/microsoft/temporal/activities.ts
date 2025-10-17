import type { LoggerInterface } from "@dust-tt/client";
import { removeNulls } from "@dust-tt/client";
import { Storage } from "@google-cloud/storage";
import type { Client } from "@microsoft/microsoft-graph-client";
import { GraphError } from "@microsoft/microsoft-graph-client";
import * as _ from "lodash";

import { getMicrosoftClient } from "@connectors/connectors/microsoft";
import {
  clientApiPost,
  extractPath,
  getAllPaginatedEntities,
  getDeltaResults,
  getDriveInternalIdFromItem,
  getDriveItemInternalId,
  getDrives,
  getFilesAndFolders,
  getFullDeltaResults,
  getItem,
  getParentReferenceInternalId,
  getSiteAPIPath,
  getSites,
  itemToMicrosoftNode,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type {
  DriveItem,
  MicrosoftNode,
} from "@connectors/connectors/microsoft/lib/types";
import {
  getDriveInternalIdFromItemId,
  internalIdFromTypeAndPath,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import { isItemNotFoundError } from "@connectors/connectors/microsoft/temporal/cast_known_errors";
import {
  deleteFile,
  deleteFolder,
  getParents,
  isAlreadySeenItem,
  recursiveNodeDeletion,
  syncOneFile,
  updateDescendantsParentsInCore,
} from "@connectors/connectors/microsoft/temporal/file";
import { getMimeTypesToSync } from "@connectors/connectors/microsoft/temporal/mime_types";
import { connectorsConfig } from "@connectors/connectors/shared/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { heartbeat } from "@connectors/lib/temporal";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  MicrosoftConfigurationResource,
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type { ModelId } from "@connectors/types";
import { cacheWithRedis, INTERNAL_MIME_TYPES } from "@connectors/types";
import { isDevelopment } from "@connectors/types";

// Delta data stored in GCS for Microsoft incremental sync batch processing
interface DeltaDataInGCS {
  deltaLink: string;
  rootNodeIds: string[];
  sortedChangedItems: DriveItem[];
  totalItems: number;
}

const FILES_SYNC_CONCURRENCY = 10;
const DELETE_CONCURRENCY = 5;

export async function getRootNodesToSync(
  connectorId: ModelId
): Promise<string[]> {
  const rootResources =
    await MicrosoftRootResource.listRootsByConnectorId(connectorId);

  return getRootNodesToSyncFromResources(connectorId, rootResources);
}

export async function getRootNodesToSyncFromResources(
  connectorId: ModelId,
  rootResources: MicrosoftRootResource[]
): Promise<string[]> {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector);
  const client = await getMicrosoftClient(connector.connectionId);

  // get root folders and drives and drill down site-root and sites to their
  // child drives (converted to MicrosoftNode types)
  const rootFolderAndDriveNodes = removeNulls(
    await Promise.all(
      rootResources
        .filter(
          (resource) =>
            resource.nodeType === "folder" || resource.nodeType === "drive"
        )
        .map(async (resource) => {
          try {
            const item = await getItem(
              logger,
              client,
              typeAndPathFromInternalId(resource.internalId).itemAPIPath
            );

            const node = itemToMicrosoftNode(
              resource.nodeType as "folder" | "drive",
              item
            );
            return {
              ...node,
              name: `${node.name} (${extractPath(item)})`,
            };
          } catch (error) {
            if (error instanceof GraphError && error.statusCode === 404) {
              return null;
            }
            if (error instanceof ExternalOAuthTokenError) {
              throw error;
            }
            logger.error(
              {
                connectorId,
                error,
                id: resource.internalId,
              },
              "Failed to get item"
            );
            return null;
          }
        })
    )
  );

  const rootSitePaths: string[] = rootResources
    .filter((resource) => resource.nodeType === "site")
    .map(
      (resource) => typeAndPathFromInternalId(resource.internalId).itemAPIPath
    );

  if (rootResources.some((resource) => resource.nodeType === "sites-root")) {
    const msSites = await getAllPaginatedEntities((nextLink) =>
      getSites(logger, client, nextLink)
    );
    rootSitePaths.push(...msSites.map((site) => getSiteAPIPath(site)));
  }

  const siteDriveNodes = (
    await concurrentExecutor(
      rootSitePaths,
      async (sitePath) => {
        const msDrives = await getAllPaginatedEntities((nextLink) =>
          getDrives(
            logger,
            client,
            internalIdFromTypeAndPath({
              nodeType: "site",
              itemAPIPath: sitePath,
            }),
            nextLink
          )
        );
        return msDrives.map((driveItem) => {
          const driveNode = itemToMicrosoftNode("drive", driveItem);
          return {
            ...driveNode,
            name: `${driveNode.name} + " (${extractPath(driveItem)})`,
          };
        });
      },
      { concurrency: 5 }
    )
  ).flat();

  // remove duplicates
  const allNodes = [...siteDriveNodes, ...rootFolderAndDriveNodes].reduce(
    (acc, current) => {
      const x = acc.find((item) => item.internalId === current.internalId);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    },
    [] as MicrosoftNode[]
  );

  // for all folders, check if a parent folder or drive is already in the list,
  // in which case remove it. This can happen because when a user selects a
  // folder to sync, then a parent folder, both are stored in Microsoft Roots
  // table

  // Keeping them both in the sync list can result in various kinds of issues,
  // e.g. if a child folder is synced before the parent, then the child folder's
  // files' parents array will be incomplete, thus the need to prune the list
  const nodesToSync = [];
  for (const node of allNodes) {
    if (
      !(
        node.nodeType === "folder" &&
        (await isParentAlreadyInNodes({
          logger,
          client,
          nodes: allNodes,
          folder: node,
        }))
      )
    ) {
      nodesToSync.push(node);
    }
  }

  const nodeResources = await MicrosoftNodeResource.batchUpdateOrCreate(
    connectorId,
    nodesToSync
  );

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await concurrentExecutor(
    nodeResources,
    async (createdOrUpdatedResource) =>
      upsertDataSourceFolder({
        dataSourceConfig,
        folderId: createdOrUpdatedResource.internalId,
        parents: [createdOrUpdatedResource.internalId],
        parentId: null,
        title: createdOrUpdatedResource.name ?? "",
        mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
        sourceUrl: createdOrUpdatedResource.webUrl ?? undefined,
      }),
    { concurrency: 5 }
  );

  return nodeResources.map((r) => r.internalId);
}

export async function groupRootItemsByDriveId(nodeIds: string[]) {
  const itemsWithDrive = nodeIds.map((id) => ({
    drive: getDriveInternalIdFromItemId(id),
    folder: id,
  }));
  return itemsWithDrive.reduce(
    (acc, current) => ({
      ...acc,
      [current.drive]: [...(acc[current.drive] || []), current.folder],
    }),
    {} as { [key: string]: string[] }
  );
}

export async function populateDeltas(connectorId: ModelId, nodeIds: string[]) {
  const groupedItems = await groupRootItemsByDriveId(nodeIds);
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const logger = getActivityLogger(connector);
  const client = await getMicrosoftClient(connector.connectionId);

  for (const [driveId, nodeIds] of Object.entries(groupedItems)) {
    const { deltaLink } = await getDeltaResults({
      logger,
      client,
      parentInternalId: driveId,
      token: "latest",
    });

    logger.info({ nodeIds, deltaLink }, "Populating deltas");

    for (const nodeId of nodeIds) {
      const node = await MicrosoftNodeResource.fetchByInternalId(
        connectorId,
        nodeId
      );

      if (!node) {
        logger.warn({ nodeId }, `Node not found while saving delta, skipping`);
      } else {
        await node.update({ deltaLink });
      }
    }
  }
}

async function isParentAlreadyInNodes({
  logger,
  client,
  nodes,
  folder,
}: {
  logger: LoggerInterface;
  client: Client;
  nodes: MicrosoftNode[];
  folder: MicrosoftNode;
}) {
  const { itemAPIPath } = typeAndPathFromInternalId(folder.internalId);

  let driveItem: DriveItem;
  try {
    driveItem = await getItem(logger, client, itemAPIPath);
  } catch (error) {
    if (error instanceof GraphError && error.statusCode === 404) {
      return false;
    }
    throw error;
  }

  // check if the list already contains the drive of this folder
  if (
    nodes.some(
      (node) => node.internalId === getDriveInternalIdFromItem(driveItem)
    )
  ) {
    return true;
  }

  // check if the list already contains any parent of this folder
  while (!driveItem.root) {
    if (!driveItem.parentReference) {
      return false;
    }

    const parentInternalId = getParentReferenceInternalId(
      driveItem.parentReference
    );

    const { itemAPIPath: parentAPIPath } =
      typeAndPathFromInternalId(parentInternalId);

    if (nodes.some((node) => node.internalId === parentInternalId)) {
      return true;
    }

    try {
      driveItem = await getItem(logger, client, parentAPIPath);
    } catch (error) {
      if (error instanceof GraphError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }
  return false;
}

export async function markNodeAsSeen(connectorId: ModelId, internalId: string) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const node = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    internalId
  );

  const logger = getActivityLogger(connector);

  if (!node) {
    logger.error(
      {
        connectorId,
        internalId,
      },
      `[MarkNodeAsSeen] Node not found, skipping`
    );

    return;
  }

  // if node was updated more recently than this sync, we don't need to mark it
  if (node.lastSeenTs && node.lastSeenTs < new Date()) {
    await node.update({ lastSeenTs: new Date() });
  }
}

/**
 * Given a drive or folder, sync files under it and returns a list of folders to sync
 */
export async function syncFiles({
  connectorId,
  parentInternalId,
  startSyncTs,
  nextPageLink,
}: {
  connectorId: ModelId;
  parentInternalId: string;
  startSyncTs: number;
  nextPageLink?: string;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector);

  const parent = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    parentInternalId
  );

  if (!parent) {
    logger.error(
      {
        connectorId,
        parentInternalId,
      },
      `[SyncFiles] Node not found, skipping`
    );

    return {
      count: 0,
      childNodes: [],
      nextLink: undefined,
    };
  }

  if (parent.nodeType !== "folder" && parent.nodeType !== "drive") {
    throw new Error(
      `Unexpected: parent node is not a folder or drive: ${parent.nodeType}`
    );
  }

  const providerConfig =
    await MicrosoftConfigurationResource.fetchByConnectorId(connectorId);

  if (!providerConfig) {
    throw new Error(`Configuration for connector ${connectorId} not found`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  logger.info(
    {
      connectorId,
      parent,
    },
    `[SyncFiles] Start sync`
  );
  const client = await getMicrosoftClient(connector.connectionId);

  // TODO(pr): handle pagination
  const childrenResult = await getFilesAndFolders(
    logger,
    client,
    parent.internalId,
    nextPageLink
  );

  const children = childrenResult.results;

  const mimeTypesToSync = await getMimeTypesToSync({
    pdfEnabled: providerConfig.pdfEnabled || false,
    csvEnabled: providerConfig.csvEnabled || false,
  });
  const filesToSync = children.filter(
    (item) =>
      item.file?.mimeType && mimeTypesToSync.includes(item.file.mimeType)
  );

  // sync files
  const results = await concurrentExecutor(
    filesToSync,
    async (child) =>
      syncOneFile({
        connectorId,
        dataSourceConfig,
        providerConfig,
        file: child,
        parentInternalId,
        startSyncTs,
        heartbeat,
      }),
    { concurrency: FILES_SYNC_CONCURRENCY }
  );

  const count = results.filter((r) => r).length;

  logger.info(
    {
      connectorId,
      dataSourceId: dataSourceConfig.dataSourceId,
      parent,
      count,
    },
    `[SyncFiles] Successful sync.`
  );

  // do not update folders that were already seen
  const folderResources = await MicrosoftNodeResource.fetchByInternalIds(
    connectorId,
    children
      .filter((item) => item.folder)
      .map((item) => getDriveItemInternalId(item))
  );

  // compute folders that were already seen
  const alreadySeenResourcesById: Record<string, MicrosoftNodeResource> = {};
  folderResources.forEach((f) => {
    if (
      isAlreadySeenItem({
        driveItemResource: f,
        startSyncTs,
      })
    ) {
      alreadySeenResourcesById[f.internalId] = f;
    }
  });

  const alreadySeenResources = Object.values(alreadySeenResourcesById);

  const createdOrUpdatedResources =
    await MicrosoftNodeResource.batchUpdateOrCreate(
      connectorId,
      children
        .filter(
          (item) =>
            item.folder &&
            // only create/update if resource unseen
            !alreadySeenResourcesById[getDriveInternalIdFromItem(item)]
        )
        .map(
          (item): MicrosoftNode => ({
            ...itemToMicrosoftNode("folder", item),
            // add parent information to new node resources
            parentInternalId,
          })
        )
    );

  const parentsOfParent = await getParents({
    connectorId: parent.connectorId,
    internalId: parent.internalId,
    startSyncTs,
  });

  await concurrentExecutor(
    createdOrUpdatedResources,
    async (createdOrUpdatedResource) =>
      upsertDataSourceFolder({
        dataSourceConfig,
        folderId: createdOrUpdatedResource.internalId,
        parents: [createdOrUpdatedResource.internalId, ...parentsOfParent],
        parentId: parentsOfParent[0],
        title: createdOrUpdatedResource.name ?? "Untitled Folder",
        mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
        sourceUrl: createdOrUpdatedResource.webUrl ?? undefined,
      }),
    { concurrency: 5 }
  );

  return {
    count,
    // still visit children of already seen nodes; an already seen node does not
    // mean all its children are already seen too
    childNodes: [...createdOrUpdatedResources, ...alreadySeenResources].map(
      (r) => r.internalId
    ),
    nextLink: childrenResult.nextLink,
  };
}

// Legacy activity, only for compatibilty.
export async function syncDeltaForRootNodesInDrive({
  connectorId,
  driveId,
  rootNodeIds,
  startSyncTs,
}: {
  connectorId: ModelId;
  driveId: string;
  rootNodeIds: string[];
  startSyncTs: number;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const providerConfig =
    await MicrosoftConfigurationResource.fetchByConnectorId(connectorId);

  if (!providerConfig) {
    throw new Error(`Configuration for connector ${connectorId} not found`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const nodeTypes = rootNodeIds.map(
    (nodeId) => typeAndPathFromInternalId(nodeId).nodeType
  );
  if (
    nodeTypes.some((nodeType) => nodeType !== "drive" && nodeType !== "folder")
  ) {
    throw new Error(`Some of ${rootNodeIds} are not a drive or folder`);
  }
  const nodes = await MicrosoftNodeResource.fetchByInternalIds(
    connectorId,
    rootNodeIds
  );
  let node = nodes[0];

  if (nodes.length !== rootNodeIds.length || !node) {
    const logger = getActivityLogger(connector);
    logger.error(
      {
        connectorId,
        rootNodeIds,
        foundNodes: nodes.length,
        expectedNodes: rootNodeIds.length,
      },
      "Some root nodes not found in database, skipping delta sync for this drive"
    );
    return;
  }

  const client = await getMicrosoftClient(connector.connectionId);

  const logger = getActivityLogger(connector);
  logger.info({ connectorId, rootNodeIds }, "Syncing delta for node");

  // Goes through pagination to return all delta results. This is because delta
  // list can include same item more than once and api recommendation is to
  // ignore all but the last one.
  //

  // although the list might be long, this should not be an issue since in case
  // of activity retry, files already synced won't be synced again thanks to the
  // lastSeenTs check VS startSyncTs
  //
  // If it ever becomes an issue, redis-caching the list and having activities
  // grabbing pages of it can be implemented

  if (!node.deltaLink) {
    const logger = getActivityLogger(connector);
    logger.info(
      { connectorId, internalId: node.internalId },
      "No delta link for root node, populating delta"
    );
    const internalId = node.internalId;
    await populateDeltas(connectorId, [internalId]);
    node =
      (await MicrosoftNodeResource.fetchByInternalId(
        connectorId,
        node.internalId
      )) ?? undefined;
    if (!node) {
      throw new Error(
        `Unreachable: Node ${internalId} (connectorId: ${connectorId}) not found after populateDeltas, skipping delta sync`
      );
    }
  }
  const { results, deltaLink } = await getDeltaData({
    logger,
    client,
    node,
    heartbeat,
  });
  const uniqueChangedItems = removeAllButLastOccurences(results);

  const sortedChangedItems: DriveItem[] = [];
  const containsWholeDrive = rootNodeIds.some(
    (nodeId) => typeAndPathFromInternalId(nodeId).nodeType === "drive"
  );

  logger.info(
    {
      uniqueChangedItems: uniqueChangedItems.length,
      containsWholeDrive,
    },
    "Changes to process"
  );

  if (containsWholeDrive) {
    sortedChangedItems.push(...sortForIncrementalUpdate(uniqueChangedItems));
  } else {
    const microsoftNodes = await concurrentExecutor(
      rootNodeIds,
      async (rootNodeId) => {
        try {
          return (await getItem(
            logger,
            client,
            typeAndPathFromInternalId(rootNodeId).itemAPIPath + "?$select=id"
          )) as { id: string };
        } catch (error) {
          if (isItemNotFoundError(error)) {
            // Resource not found will be garbage collected later and is not blocking the activity
            logger.info(
              { rootNodeId, error: error.message },
              "Root node not found, skipping"
            );
            return null;
          }
          throw error;
        }
      },
      { concurrency: 5 }
    );
    const validMicrosoftNodes = microsoftNodes.filter(
      (node): node is { id: string } => node !== null
    );
    validMicrosoftNodes.forEach((rootNode) => {
      sortedChangedItems.push(
        ...sortForIncrementalUpdate(uniqueChangedItems, rootNode.id)
      );
    });
    // if only parts of the drive are selected, look for folders that may
    // have been removed from selection and scrub them
    await scrubRemovedFolders({
      connector,
      uniqueChangedItems,
      sortedChangedItems,
    });
  }
  let count = 0;
  let skipped = 0;
  let deleted = 0;
  let folders = 0;
  let files = 0;
  for (const driveItem of sortedChangedItems) {
    count++;
    if (count % 1000 === 0) {
      logger.info(
        {
          count,
          skipped,
          deleted,
          folders,
          files,
          total: sortedChangedItems.length,
        },
        "Processing delta changes"
      );
    }

    await heartbeat();
    if (!driveItem.parentReference) {
      throw new Error(`Unexpected: parent reference missing: ${driveItem}`);
    }

    const internalId = getDriveItemInternalId(driveItem);

    if (driveItem.file) {
      if (driveItem.deleted) {
        const isDeleted = await deleteFile({
          connectorId,
          internalId,
          dataSourceConfig,
        });
        if (isDeleted) {
          deleted++;
        } else {
          skipped++;
        }
      } else {
        const isSynced = await syncOneFile({
          connectorId,
          dataSourceConfig,
          providerConfig,
          file: driveItem,
          parentInternalId: getParentReferenceInternalId(
            driveItem.parentReference
          ),
          startSyncTs,
          heartbeat,
        });
        if (isSynced) {
          files++;
        } else {
          skipped++;
        }
      }
    } else if (driveItem.folder) {
      if (driveItem.deleted) {
        // no need to delete children here since they will all be listed
        // in the delta with the 'deleted' field set
        // we can delete, even if it is not a root node, because microsoft
        // tells us the client has already deleted the folder
        const isDeleted = await deleteFolder({
          connectorId,
          dataSourceConfig,
          internalId,
          deleteRootNode: true,
        });
        if (isDeleted) {
          deleted++;
        } else {
          skipped++;
        }
      } else {
        const { item, type } = driveItem.root
          ? {
              item: await getItem(
                logger,
                client,
                `/drives/${driveItem.parentReference.driveId}`
              ),
              type: "drive" as const,
            }
          : { item: driveItem, type: "folder" as const };

        const blob = itemToMicrosoftNode(type, item);

        if (rootNodeIds.includes(blob.internalId)) {
          blob.name = blob.name + ` (${extractPath(item)})`;
        }

        const existingResource = await MicrosoftNodeResource.fetchByInternalId(
          connectorId,
          blob.internalId
        );
        if (
          existingResource &&
          isAlreadySeenItem({
            driveItemResource: existingResource,
            startSyncTs,
          })
        ) {
          skipped++;
          continue;
        }

        const isMoved = await isFolderMovedInSameRoot({
          connectorId,
          folder: driveItem,
          internalId,
        });

        const resource = await MicrosoftNodeResource.updateOrCreate(
          connectorId,
          blob
        );

        // add parent information to new node resource. for the toplevel folder,
        // parent is null
        const parentInternalId = getParentReferenceInternalId(
          driveItem.parentReference
        );

        const isTopLevel =
          resource.internalId === driveId ||
          (rootNodeIds.indexOf(resource.internalId) !== -1 &&
            !(await MicrosoftNodeResource.fetchByInternalId(
              connectorId,
              parentInternalId
            )));

        await resource.update({
          parentInternalId: isTopLevel ? null : parentInternalId,
        });

        const parents = await getParents({
          connectorId,
          internalId: blob.internalId,
          startSyncTs,
        });

        logger.info(
          { parents, title: blob.name, internalId: blob.internalId },
          "Upserting folder"
        );

        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: blob.internalId,
          parents,
          parentId: parents[1] || null,
          title: blob.name ?? "Untitled Folder",
          mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
          sourceUrl: blob.webUrl ?? undefined,
        });

        if (isMoved) {
          await updateDescendantsParentsInCore({
            dataSourceConfig,
            folder: resource,
            startSyncTs,
          });
        }

        await resource.update({
          lastSeenTs: new Date(),
        });
        folders++;
      }
    } else {
      throw new Error(`Unexpected: driveItem is neither file nor folder`);
    }
  }

  await concurrentExecutor(
    nodes,
    (node) => node && node.update({ deltaLink }),
    { concurrency: 5 }
  );

  logger.info({ connectorId, driveId, rootNodeIds }, "Delta sync complete");
}

export async function fetchDeltaForRootNodesInDrive({
  connectorId,
  driveId,
  rootNodeIds,
}: {
  connectorId: ModelId;
  driveId: string;
  rootNodeIds: string[];
}): Promise<{ gcsFilePath: string | null }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector);

  const nodeTypes = rootNodeIds.map(
    (nodeId) => typeAndPathFromInternalId(nodeId).nodeType
  );

  if (
    nodeTypes.some((nodeType) => nodeType !== "drive" && nodeType !== "folder")
  ) {
    throw new Error(`Some of ${rootNodeIds} are not a drive or folder`);
  }

  const nodes = await MicrosoftNodeResource.fetchByInternalIds(
    connectorId,
    rootNodeIds
  );

  let node = nodes[0];

  if (nodes.length !== rootNodeIds.length || !node) {
    logger.error(
      {
        connectorId,
        rootNodeIds,
        foundNodes: nodes.length,
        expectedNodes: rootNodeIds.length,
      },
      "Some root nodes not found in database, skipping delta sync for this drive"
    );
    return { gcsFilePath: null };
  }

  const client = await getMicrosoftClient(connector.connectionId);

  logger.info({ connectorId, rootNodeIds }, "Fetching delta for node");

  // Goes through pagination to return all delta results. This is because delta
  // list can include same item more than once and api recommendation is to
  // ignore all but the last one.

  if (!node.deltaLink) {
    const logger = getActivityLogger(connector);
    logger.info(
      { connectorId, internalId: node.internalId },
      "No delta link for root node, populating delta"
    );
    const internalId = node.internalId;
    await populateDeltas(connectorId, [internalId]);
    node =
      (await MicrosoftNodeResource.fetchByInternalId(
        connectorId,
        node.internalId
      )) ?? undefined;
    if (!node) {
      throw new Error(
        `Unreachable: Node ${internalId} (connectorId: ${connectorId}) not found after populateDeltas, skipping delta sync`
      );
    }
  }

  const { results, deltaLink } = await getDeltaData({
    logger,
    client,
    node,
    heartbeat,
  });

  // Generate a unique GCS file path for this delta sync
  const timestamp = Date.now();
  const gcsFilePath = `microsoft-delta-sync/${connectorId}/${driveId}/${timestamp}_delta.json`;

  // Upload the delta data to GCS
  const storage = new Storage({
    keyFilename: isDevelopment()
      ? connectorsConfig.getServiceAccount()
      : undefined,
  });
  const bucket = storage.bucket(connectorsConfig.getDustTmpSyncBucketName());
  const file = bucket.file(gcsFilePath);

  // Process changes in batches of 1000
  const uniqueChangedItems = removeAllButLastOccurences(results);
  const sortedChangedItems: DriveItem[] = [];
  const containsWholeDrive = rootNodeIds.some(
    (nodeId) => typeAndPathFromInternalId(nodeId).nodeType === "drive"
  );

  if (containsWholeDrive) {
    sortedChangedItems.push(...sortForIncrementalUpdate(uniqueChangedItems));
  } else {
    const microsoftNodes = await concurrentExecutor(
      rootNodeIds,
      async (rootNodeId) => {
        try {
          return (await getItem(
            logger,
            client,
            typeAndPathFromInternalId(rootNodeId).itemAPIPath + "?$select=id"
          )) as { id: string };
        } catch (error) {
          if (isItemNotFoundError(error)) {
            // Resource not found will be garbage collected later and is not blocking the workflow
            logger.info(
              { rootNodeId, error: error.message },
              "Root node not found, skipping"
            );
            return null;
          }
          throw error;
        }
      },
      { concurrency: 5 }
    );
    const validMicrosoftNodes = microsoftNodes.filter(
      (node): node is { id: string } => node !== null
    );
    validMicrosoftNodes.forEach((rootNode) => {
      sortedChangedItems.push(
        ...sortForIncrementalUpdate(uniqueChangedItems, rootNode.id)
      );
    });

    // if only parts of the drive are selected, look for folders that may
    // have been removed from selection and scrub them
    await scrubRemovedFolders({
      connector,
      uniqueChangedItems,
      sortedChangedItems,
    });
  }

  if (sortedChangedItems.length === 0) {
    logger.info(
      { connectorId, driveId, rootNodeIds },
      "No changes found, skipping delta sync"
    );
    return { gcsFilePath: null };
  }

  const deltaData: DeltaDataInGCS = {
    deltaLink,
    rootNodeIds,
    sortedChangedItems,
    totalItems: sortedChangedItems.length,
  };

  await file.save(JSON.stringify(deltaData), {
    metadata: {
      contentType: "application/json",
      metadata: {
        connectorId: connectorId.toString(),
        driveId,
        timestamp: timestamp.toString(),
        type: "microsoft-delta-sync",
      },
    },
  });

  logger.info(
    {
      connectorId,
      driveId,
      gcsFilePath,
      resultsCount: results.length,
      totalItems: sortedChangedItems.length,
    },
    "Delta data fetched, processed, and uploaded to GCS"
  );

  return { gcsFilePath };
}

export async function cleanupDeltaGCSFile({
  connectorId,
  driveId,
  gcsFilePath,
}: {
  connectorId: ModelId;
  driveId: string;
  gcsFilePath: string;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector);

  try {
    const storage = new Storage({
      keyFilename: isDevelopment()
        ? connectorsConfig.getServiceAccount()
        : undefined,
    });
    const bucket = storage.bucket(connectorsConfig.getDustTmpSyncBucketName());
    const file = bucket.file(gcsFilePath);

    await file.delete();
    logger.info(
      { connectorId, driveId, gcsFilePath },
      "Successfully cleaned up delta GCS file"
    );
  } catch (error) {
    logger.error(
      {
        connectorId,
        driveId,
        gcsFilePath,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to cleanup delta GCS file"
    );
    // Don't throw error as this is cleanup and shouldn't fail the workflow
  }
}

/**
 *  As per recommendation, remove all but the last occurences of the same
 *  driveItem in the list
 */
function removeAllButLastOccurences(deltaList: DriveItem[]) {
  const uniqueDeltas = new Set<string>();
  const resultList = [];
  for (const driveItem of deltaList.reverse()) {
    if (!driveItem.id) {
      throw new Error(`DriveItem id is missing: ${driveItem}`);
    }

    if (uniqueDeltas.has(driveItem.id)) {
      continue;
    }
    uniqueDeltas.add(driveItem.id);
    resultList.push(driveItem);
  }

  return resultList;
}

/**
 * Order items as follows:
 * - first the node in the changedList matching rootid, or the drive root folder if no rootId is specified
 * - then those whose parentInternalId is in in the list above;
 * - then those whose parentInternalId is in the updated list above, and so on
 *
 * This ensures we sync parents before their children; the converse would cause
 * errors. For the initial case, if we don't have the parent in the changelist,
 * it means it is already properly synced and did not change.
 *
 * The function makes the assumption that there is no circular parent
 * relationship
 */
function sortForIncrementalUpdate(changedList: DriveItem[], rootId?: string) {
  if (changedList.length === 0) {
    return [];
  }

  // Initial list - either the root folder of the drive if no rootId, of the item identified by rootId
  const sortedItemList = changedList.filter((item) => {
    if (rootId && item.id === rootId) {
      // Found selected root
      return true;
    }

    if (!rootId && item.root) {
      // Root folder of the drive, include it if no specific root was passed
      return true;
    }

    return false;
  });

  // As we will iterate on both sortedItemList and changedList, we need to
  // keep track of the items we have already seen in sortedItemList to avoid
  // O(n^2) complexity.
  const sortedItemSet = new Set(sortedItemList.map(getDriveItemInternalId));

  for (;;) {
    const nextLevel = changedList.filter((item) => {
      // Already in the list - skip
      if (sortedItemSet.has(getDriveItemInternalId(item))) {
        return false;
      }

      // not needed, but just to please TS
      if (!item.parentReference) {
        return true;
      }

      // get the parentInternalId of the item
      // warning : if node is in the root folder of a drive, we'll get the drive id instead of root folder id
      const parentInternalId = getParentReferenceInternalId(
        item.parentReference
      );

      // hack here as parentInternalId is the drive and no rootId specified,
      // but we only have the drive root folder in the list
      if (
        typeAndPathFromInternalId(parentInternalId).nodeType === "drive" &&
        !rootId
      ) {
        return true;
      }

      return sortedItemSet.has(parentInternalId);
    });

    if (nextLevel.length === 0) {
      return sortedItemList;
    }

    sortedItemList.push(...nextLevel);

    // Mark nodes as seen for the next iterations.
    nextLevel.forEach((item) => {
      sortedItemSet.add(getDriveItemInternalId(item));
    });
  }
}

async function getDeltaData({
  logger,
  client,
  node,
  heartbeat,
}: {
  logger: LoggerInterface;
  client: Client;
  node: MicrosoftNodeResource;
  heartbeat: () => void;
}) {
  if (!node.deltaLink) {
    throw new Error(`No delta link for root node ${node.internalId}`);
  }

  logger.info(
    { internalId: node.internalId, deltaLink: node.deltaLink },
    "Getting delta"
  );

  try {
    return await getFullDeltaResults({
      logger,
      client,
      parentInternalId: node.internalId,
      initialDeltaLink: node.deltaLink,
      heartbeatFunction: heartbeat,
    });
  } catch (e) {
    if (e instanceof GraphError && e.statusCode === 410) {
      // API is answering 'resync required'
      // we repopulate the delta from scratch
      return await getFullDeltaResults({
        logger,
        client,
        parentInternalId: node.internalId,
        heartbeatFunction: heartbeat,
      });
    }
    throw e;
  }
}

async function isFolderMovedInSameRoot({
  connectorId,
  folder,
  internalId,
}: {
  connectorId: ModelId;
  folder: DriveItem;
  internalId: string;
}) {
  if (!folder.parentReference) {
    throw new Error(`Unexpected: parent reference missing: ${folder}`);
  }

  const oldResource = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    internalId
  );

  if (!oldResource) {
    // the folder was not moved internally since we don't have it
    return false;
  }

  const oldParentId = oldResource.parentInternalId;

  if (!oldParentId) {
    // this means it is a root
    return false;
  }

  const newParentId = getParentReferenceInternalId(folder.parentReference);

  return oldParentId !== newParentId;
}

export async function microsoftDeletionActivity({
  connectorId,
  nodeIdsToDelete,
}: {
  connectorId: ModelId;
  nodeIdsToDelete: string[];
}): Promise<string[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return [];
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const results = await concurrentExecutor(
    nodeIdsToDelete,
    async (nodeId) => {
      // First check if we have a parentInternalId.
      // This means an ancestor is selected, and this node should not be removed
      const node = await MicrosoftNodeResource.fetchByInternalId(
        connectorId,
        nodeId
      );
      if (node && node.parentInternalId) {
        return [];
      }

      // Node has no parent and has been removed from selection - delete recursively
      return recursiveNodeDeletion({
        nodeId,
        connectorId,
        dataSourceConfig,
      });
    },
    { concurrency: DELETE_CONCURRENCY }
  );

  return results.flat();
}

export async function microsoftGarbageCollectionActivity({
  connectorId,
  idCursor,
  startGarbageCollectionTs,
}: {
  connectorId: ModelId;
  idCursor: ModelId;
  startGarbageCollectionTs: number;
}) {
  const rootNodeIds = await getRootNodesToSync(connectorId);

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const logger = getActivityLogger(connector);
  logger.info(
    { connectorId, idCursor },
    "Garbage collection activity for cursor"
  );
  const client = await getMicrosoftClient(connector.connectionId);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const nodes = await MicrosoftNodeResource.fetchByPaginatedIds({
    connectorId,
    pageSize: 1000,
    idCursor,
  });

  const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;

  if (!lastNode) {
    return null;
  }

  const nextIdCursor = lastNode.id + 1;

  // only consider nodes that were not seen after the start of the garbage
  // collection. This avoids edge cases such as if a node is moved back to sync
  // during the garbage collection and the caching below prevents this from
  // being detected
  const nodesToCheck = nodes
    .filter((n) => n.lastSeenTs ?? 0 < startGarbageCollectionTs)
    .filter(
      (n) =>
        n.nodeType === "drive" ||
        n.nodeType === "folder" ||
        n.nodeType === "file"
    );

  const requests = nodesToCheck.map((n, i) => ({
    id: `${i}`,
    url: typeAndPathFromInternalId(n.internalId).itemAPIPath,
    method: "GET",
  }));

  const chunkedRequests = _.chunk(requests, 20);

  const nodeResources = await MicrosoftNodeResource.fetchByInternalIds(
    connectorId,
    nodesToCheck.map((n) => n.internalId)
  );

  const nodeResourceMap = new Map(
    nodeResources.map((resource) => [resource.internalId, resource])
  );

  for (const chunk of chunkedRequests) {
    let batchRes: {
      responses: Array<{
        id: string;
        status: number;
        body: unknown;
      }>;
    };
    try {
      batchRes = await clientApiPost(logger, client, "/$batch", {
        requests: chunk,
      });
    } catch (error) {
      if (isItemNotFoundError(error)) {
        logger.info(
          {
            connectorId,
            error: error.message,
            chunkSize: chunk.length,
          },
          "Batch request failed with 404, treating all items as deleted"
        );
        // Create fake 404 responses for all items in the chunk
        batchRes = {
          responses: chunk.map((req) => ({
            id: req.id,
            status: 404,
            body: null,
          })),
        };
      } else {
        throw error;
      }
    }

    for (const res of batchRes.responses) {
      const node = nodesToCheck[Number(res.id)];
      if (node && (res.status === 200 || res.status === 404)) {
        const driveOrItem = res.status === 200 ? res.body : null;

        // don't delete if we don't have the item in DB / the item have a skip reason
        const nodeResource = nodeResourceMap.get(node.internalId);
        if (!nodeResource || nodeResource.skipReason) {
          continue;
        }

        switch (node.nodeType) {
          case "drive":
            if (!driveOrItem) {
              await deleteFolder({
                connectorId,
                dataSourceConfig,
                internalId: node.internalId,
                deleteRootNode: true,
              });
            } else if (!rootNodeIds.includes(node.internalId)) {
              await deleteFolder({
                connectorId,
                dataSourceConfig,
                internalId: node.internalId,
              });
            }
            break;
          case "folder": {
            const folder = driveOrItem as DriveItem;
            if (
              !folder ||
              folder.deleted ||
              // isOutsideRootNodes
              (await isOutsideRootNodes({
                logger,
                client,
                driveItem: folder,
                rootNodeIds,
                startGarbageCollectionTs,
              }))
            ) {
              await deleteFolder({
                connectorId,
                dataSourceConfig,
                internalId: node.internalId,
                deleteRootNode: true,
              });
            }
            break;
          }
          case "file": {
            const file = driveOrItem as DriveItem;
            if (
              !file ||
              file.deleted ||
              // isOutsideRootNodes
              (await isOutsideRootNodes({
                logger,
                client,
                driveItem: file,
                rootNodeIds,
                startGarbageCollectionTs,
              }))
            ) {
              await deleteFile({
                connectorId,
                internalId: node.internalId,
                dataSourceConfig,
              });
            }
            break;
          }
          default:
            throw new Error(
              `Unreachable: Deletion not implemented for node type: ${node.nodeType}`
            );
        }
      }
    }
  }

  return nextIdCursor;
}

const cachedGetParentFromGraphAPI = cacheWithRedis(
  async ({
    logger,
    client,
    parentInternalId,
  }: {
    logger: LoggerInterface;
    client: Client;
    parentInternalId: string;
    startGarbageCollectionTs: number;
  }) => {
    const { itemAPIPath, nodeType } =
      typeAndPathFromInternalId(parentInternalId);

    if (nodeType === "drive") {
      return null;
    }

    try {
      const driveItem: DriveItem = await getItem(logger, client, itemAPIPath);

      if (!driveItem.parentReference) {
        throw new Error("Unexpected: no parent reference for drive item");
      }

      return getParentReferenceInternalId(driveItem.parentReference);
    } catch (error) {
      if (isItemNotFoundError(error)) {
        logger.info(
          {
            parentInternalId,
            error: error.message,
          },
          "Parent item not found, treating as no parent"
        );
        return null;
      }
      throw error;
    }
  },
  ({
    parentInternalId,
    startGarbageCollectionTs,
  }: {
    client: Client;
    parentInternalId: string;
    startGarbageCollectionTs: number;
  }) =>
    `microsoft-garbage-collection-ts-${startGarbageCollectionTs}-node-${parentInternalId}`,
  {
    ttlMs: 60 * 60 * 24 * 1000,
  }
);

async function isOutsideRootNodes({
  logger,
  client,
  driveItem,
  rootNodeIds,
  startGarbageCollectionTs,
}: {
  logger: LoggerInterface;
  client: Client;
  driveItem: DriveItem;
  rootNodeIds: string[];
  startGarbageCollectionTs: number;
}) {
  try {
    if (
      rootNodeIds.includes(getDriveItemInternalId(driveItem)) ||
      rootNodeIds.includes(getDriveInternalIdFromItem(driveItem))
    ) {
      return false;
    }
  } catch (error) {
    logger.error(
      {
        driveItem,
      },
      "Error checking driveItem internalId on deletion."
    );
    return false;
  }

  if (!driveItem.parentReference) {
    throw new Error("Unexpected: no parent reference for drive item");
  }

  let parentInternalId: string | null = getParentReferenceInternalId(
    driveItem.parentReference
  );

  do {
    if (rootNodeIds.includes(parentInternalId)) {
      return false;
    }
    parentInternalId = await cachedGetParentFromGraphAPI({
      logger,
      client,
      parentInternalId,
      startGarbageCollectionTs,
    });
  } while (parentInternalId !== null);

  return true;
}

/**
 * Detect files & folders moved out of toplevel folders and delete them
 * Such a case is e.g.:
 * - only folder A is selected for sync, not the whole drive
 * - folder B is not selected for sync
 * - folder C was a subfolder of A and is moved out of A into B
 * In that case, C should be deleted from the sync
 */
async function scrubRemovedFolders({
  connector,
  uniqueChangedItems,
  sortedChangedItems,
}: {
  connector: ConnectorResource;
  uniqueChangedItems: DriveItem[];
  sortedChangedItems: DriveItem[];
}) {
  // all elements from the changelist that are in uniqueChangedItems but not in
  // sortedChangedItems are out of the selected roots
  // we use a set to avoid O(n^2) complexity
  const sortedChangedItemsSet = new Set(
    sortedChangedItems.map((item) => item.id)
  );
  const outOfRoots = uniqueChangedItems.filter(
    // the drive root folder is always in the list but we never need to delete it
    (item) => !sortedChangedItemsSet.has(item.id) && !item.root
  );

  const outOfRootsInternalIds = outOfRoots.map((item) =>
    getDriveItemInternalId(item)
  );

  const nodes = await MicrosoftNodeResource.fetchByInternalIds(
    connector.id,
    outOfRootsInternalIds
  );

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const logger = getActivityLogger(connector);
  logger.info(
    {
      connectorId: connector.id,
      nodes: nodes.map((n) => n.toJSON()),
    },
    "Scrubbing removed folders"
  );

  for (const node of nodes) {
    if (node.nodeType === "file") {
      await deleteFile({
        connectorId: connector.id,
        internalId: node.internalId,
        dataSourceConfig,
      });
    } else if (node.nodeType === "folder") {
      await recursiveNodeDeletion({
        nodeId: node.internalId,
        connectorId: connector.id,
        dataSourceConfig,
      });
    }
  }
}

export async function processDeltaChangesFromGCS({
  connectorId,
  driveId,
  gcsFilePath,
  startSyncTs,
  cursor = 0,
  batchSize = 1000,
}: {
  connectorId: ModelId;
  driveId: string;
  gcsFilePath: string;
  startSyncTs: number;
  cursor?: number;
  batchSize?: number;
}): Promise<{ nextCursor: number | null; processedCount: number }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const providerConfig =
    await MicrosoftConfigurationResource.fetchByConnectorId(connectorId);

  if (!providerConfig) {
    throw new Error(`Configuration for connector ${connectorId} not found`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const logger = getActivityLogger(connector);

  // Read the GCS file to get the list of changed items
  const storage = new Storage({
    keyFilename: isDevelopment()
      ? connectorsConfig.getServiceAccount()
      : undefined,
  });
  const bucket = storage.bucket(connectorsConfig.getDustTmpSyncBucketName());
  const file = bucket.file(gcsFilePath);

  const [content] = await file.download();
  const changedItemsData = JSON.parse(content.toString()) as DeltaDataInGCS;

  const { deltaLink, rootNodeIds, sortedChangedItems, totalItems } =
    changedItemsData;

  logger.info(
    {
      totalItems,
      batchSize,
      cursor,
    },
    "Processing delta changes"
  );

  // Process changes in batches
  const startIndex = cursor;
  const endIndex = Math.min(startIndex + batchSize, sortedChangedItems.length);
  const currentBatch = sortedChangedItems.slice(startIndex, endIndex);

  // If no items to process, return early
  if (currentBatch.length === 0) {
    logger.info(
      {
        connectorId,
        driveId,
        rootNodeIds,
        cursor,
        totalItems,
      },
      "No items to process in current batch"
    );
    return {
      nextCursor: null,
      processedCount: 0,
    };
  }

  logger.info(
    {
      totalItems,
      startIndex,
      endIndex,
      batchSize: currentBatch.length,
      cursor,
    },
    "Processing batch of changes"
  );

  let count = 0;
  let skipped = 0;
  let deleted = 0;
  let folders = 0;
  let files = 0;

  for (const driveItem of currentBatch) {
    count++;
    if (count % 100 === 0) {
      logger.info(
        {
          count,
          skipped,
          deleted,
          folders,
          files,
          total: currentBatch.length,
          batchProgress: `${startIndex + count}/${totalItems}`,
        },
        "Processing delta changes batch"
      );
    }

    await heartbeat();
    if (!driveItem.parentReference) {
      throw new Error(`Unexpected: parent reference missing: ${driveItem}`);
    }

    const internalId = getDriveItemInternalId(driveItem);

    if (driveItem.file) {
      if (driveItem.deleted) {
        const isDeleted = await deleteFile({
          connectorId,
          internalId,
          dataSourceConfig,
        });
        if (isDeleted) {
          deleted++;
        } else {
          skipped++;
        }
      } else {
        try {
          const isSynced = await syncOneFile({
            connectorId,
            dataSourceConfig,
            providerConfig,
            file: driveItem,
            parentInternalId: getParentReferenceInternalId(
              driveItem.parentReference
            ),
            startSyncTs,
            heartbeat,
          });
          if (isSynced) {
            files++;
          } else {
            skipped++;
          }
        } catch (error) {
          if (error instanceof GraphError && error.statusCode === 404) {
            logger.error({ error }, "File not found, deleting");
            const isDeleted = await deleteFile({
              connectorId,
              internalId,
              dataSourceConfig,
            });
            if (isDeleted) {
              deleted++;
            } else {
              skipped++;
            }
          }
        }
      }
    } else if (driveItem.folder) {
      if (driveItem.deleted) {
        // no need to delete children here since they will all be listed
        // in the delta with the 'deleted' field set
        // we can delete, even if it is not a root node, because microsoft
        // tells us the client has already deleted the folder
        const isDeleted = await deleteFolder({
          connectorId,
          dataSourceConfig,
          internalId,
          deleteRootNode: true,
        });
        if (isDeleted) {
          deleted++;
        } else {
          skipped++;
        }
      } else {
        const client = await getMicrosoftClient(connector.connectionId);
        const { item, type } = driveItem.root
          ? {
              item: await getItem(
                logger,
                client,
                `/drives/${driveItem.parentReference.driveId}`
              ),
              type: "drive" as const,
            }
          : { item: driveItem, type: "folder" as const };

        const blob = itemToMicrosoftNode(type, item);

        if (rootNodeIds.includes(blob.internalId)) {
          blob.name = blob.name + ` (${extractPath(item)})`;
        }

        const existingResource = await MicrosoftNodeResource.fetchByInternalId(
          connectorId,
          blob.internalId
        );
        if (
          existingResource &&
          isAlreadySeenItem({
            driveItemResource: existingResource,
            startSyncTs,
          })
        ) {
          skipped++;
          continue;
        }

        const isMoved = await isFolderMovedInSameRoot({
          connectorId,
          folder: driveItem,
          internalId,
        });

        const resource = await MicrosoftNodeResource.updateOrCreate(
          connectorId,
          blob
        );

        // add parent information to new node resource. for the toplevel folder,
        // parent is null
        const parentInternalId = getParentReferenceInternalId(
          driveItem.parentReference
        );

        const isTopLevel =
          resource.internalId === driveId ||
          (rootNodeIds.indexOf(resource.internalId) !== -1 &&
            !(await MicrosoftNodeResource.fetchByInternalId(
              connectorId,
              parentInternalId
            )));

        await resource.update({
          parentInternalId: isTopLevel ? null : parentInternalId,
        });

        const parents = await getParents({
          connectorId,
          internalId: blob.internalId,
          startSyncTs,
        });

        logger.info(
          { parents, title: blob.name, internalId: blob.internalId },
          "Upserting folder"
        );

        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: blob.internalId,
          parents,
          parentId: parents[1] || null,
          title: blob.name ?? "Untitled Folder",
          mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
          sourceUrl: blob.webUrl ?? undefined,
        });

        if (isMoved) {
          await updateDescendantsParentsInCore({
            dataSourceConfig,
            folder: resource,
            startSyncTs,
          });
        }

        await resource.update({
          lastSeenTs: new Date(),
        });
        folders++;
      }
    } else {
      throw new Error(`Unexpected: driveItem is neither file nor folder`);
    }
  }

  // Update the delta link for all nodes
  const nodes = await MicrosoftNodeResource.fetchByInternalIds(
    connectorId,
    rootNodeIds
  );
  await concurrentExecutor(
    nodes,
    (node) => node && node.update({ deltaLink }),
    { concurrency: 5 }
  );

  logger.info(
    {
      connectorId,
      driveId,
      rootNodeIds,
      processedCount: currentBatch.length,
      totalProcessed: startIndex + currentBatch.length,
      totalItems,
      hasMore: endIndex < totalItems,
    },
    "Delta changes batch processing complete"
  );

  // Return cursor for next batch or null if all items processed
  const nextCursor = endIndex < totalItems ? endIndex : null;

  return {
    nextCursor,
    processedCount: currentBatch.length,
  };
}
