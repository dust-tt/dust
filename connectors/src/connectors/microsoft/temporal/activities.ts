import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Client } from "@microsoft/microsoft-graph-client";
import { GraphError } from "@microsoft/microsoft-graph-client";
import type { DriveItem } from "@microsoft/microsoft-graph-types";
import { heartbeat } from "@temporalio/activity";

import { getClient } from "@connectors/connectors/microsoft";
import {
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
import type { MicrosoftNode } from "@connectors/connectors/microsoft/lib/types";
import {
  getDriveInternalIdFromItemId,
  internalIdFromTypeAndPath,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import {
  deleteFile,
  deleteFolder,
  getParents,
  isAlreadySeenItem,
  recursiveNodeDeletion,
  syncOneFile,
} from "@connectors/connectors/microsoft/temporal/file";
import { getMimeTypesToSync } from "@connectors/connectors/microsoft/temporal/mime_types";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  MicrosoftConfigurationResource,
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const FILES_SYNC_CONCURRENCY = 10;
const DELETE_CONCURRENCY = 5;

export async function getRootNodesToSync(
  connectorId: ModelId
): Promise<string[]> {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const client = await getClient(connector.connectionId);

  const rootResources =
    await MicrosoftRootResource.listRootsByConnectorId(connectorId);

  // get root folders and drives and drill down site-root and sites to their
  // child drives (converted to MicrosoftNode types)
  const rootFolderAndDriveNodes = await Promise.all(
    rootResources
      .filter(
        (resource) =>
          resource.nodeType === "folder" || resource.nodeType === "drive"
      )
      .map(async (resource) =>
        itemToMicrosoftNode(
          resource.nodeType as "folder" | "drive",
          await getItem(
            client,
            typeAndPathFromInternalId(resource.internalId).itemAPIPath
          )
        )
      )
  );

  const rootSitePaths: string[] = rootResources
    .filter((resource) => resource.nodeType === "site")
    .map(
      (resource) => typeAndPathFromInternalId(resource.internalId).itemAPIPath
    );

  if (rootResources.some((resource) => resource.nodeType === "sites-root")) {
    const msSites = await getAllPaginatedEntities((nextLink) =>
      getSites(client, nextLink)
    );
    rootSitePaths.push(...msSites.map((site) => getSiteAPIPath(site)));
  }

  const siteDriveNodes = (
    await concurrentExecutor(
      rootSitePaths,
      async (sitePath) => {
        const msDrives = await getAllPaginatedEntities((nextLink) =>
          getDrives(
            client,
            internalIdFromTypeAndPath({
              nodeType: "site",
              itemAPIPath: sitePath,
            }),
            nextLink
          )
        );
        return msDrives.map((drive) => itemToMicrosoftNode("drive", drive));
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

  const client = await getClient(connector.connectionId);

  for (const [driveId, nodeIds] of Object.entries(groupedItems)) {
    const { deltaLink } = await getDeltaResults({
      client,
      parentInternalId: driveId,
      token: "latest",
    });

    for (const nodeId of nodeIds) {
      const node = await MicrosoftNodeResource.fetchByInternalId(
        connectorId,
        nodeId
      );

      if (!node) {
        throw new Error(`Node ${nodeId} not found`);
      }

      await node.update({ deltaLink });
    }
  }
}

async function isParentAlreadyInNodes({
  client,
  nodes,
  folder,
}: {
  client: Client;
  nodes: MicrosoftNode[];
  folder: MicrosoftNode;
}) {
  const { itemAPIPath } = typeAndPathFromInternalId(folder.internalId);
  let driveItem: microsoftgraph.DriveItem = await getItem(client, itemAPIPath);

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

    driveItem = await getItem(client, parentAPIPath);
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

  if (!node) {
    throw new Error(`Node ${internalId} not found`);
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

  const parent = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    parentInternalId
  );

  if (!parent) {
    throw new Error(`Unexpected: parent node not found: ${parentInternalId}`);
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
  const client = await getClient(connector.connectionId);

  // TODO(pr): handle pagination
  const childrenResult = await getFilesAndFolders(
    client,
    parent.internalId,
    nextPageLink
  );

  const children = childrenResult.results;

  const mimeTypesToSync = await getMimeTypesToSync({
    pdfEnabled: providerConfig.pdfEnabled || false,
    connector,
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
      }),
    { concurrency: FILES_SYNC_CONCURRENCY }
  );

  const count = results.filter((r) => r).length;

  logger.info(
    {
      connectorId,
      dataSourceName: dataSourceConfig.dataSourceName,
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

  const node = nodes[0];

  if (nodes.length !== rootNodeIds.length || !node) {
    throw new Error(`Root or node resource ${nodes} not found`);
  }

  const client = await getClient(connector.connectionId);

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
  const { results, deltaLink } = await getDeltaData({
    client,
    node,
  });
  const uniqueChangedItems = removeAllButLastOccurences(results);

  const sortedChangedItems: DriveItem[] = [];
  const containWholeDrive = rootNodeIds.some(
    (nodeId) => typeAndPathFromInternalId(nodeId).nodeType === "drive"
  );

  if (containWholeDrive) {
    sortedChangedItems.push(...sortForIncrementalUpdate(uniqueChangedItems));
  } else {
    const microsoftNodes = await concurrentExecutor(
      rootNodeIds,
      async (rootNodeId) =>
        getItem(client, typeAndPathFromInternalId(rootNodeId).itemAPIPath),
      { concurrency: 5 }
    );

    microsoftNodes.forEach((rootNode) => {
      sortedChangedItems.push(
        ...sortForIncrementalUpdate(uniqueChangedItems, rootNode.id)
      );
    });
  }

  // Finally add all removed items, which may not have been included even if they are in the selected roots
  sortedChangedItems.push(
    ...uniqueChangedItems.filter(
      (item) =>
        !sortedChangedItems.includes(item) && item.deleted?.state === "deleted"
    )
  );

  for (const driveItem of sortedChangedItems) {
    heartbeat();
    if (!driveItem.parentReference) {
      throw new Error(`Unexpected: parent reference missing: ${driveItem}`);
    }

    const internalId = getDriveItemInternalId(driveItem);

    if (driveItem.file) {
      if (driveItem.deleted) {
        await deleteFile({ connectorId, internalId, dataSourceConfig });
      } else {
        await syncOneFile({
          connectorId,
          dataSourceConfig,
          providerConfig,
          file: driveItem,
          parentInternalId: getParentReferenceInternalId(
            driveItem.parentReference
          ),
          startSyncTs,
        });
      }
    } else if (driveItem.folder) {
      if (driveItem.deleted) {
        // no need to delete children here since they will all be listed
        // in the delta with the 'deleted' field set
        await deleteFolder({ connectorId, internalId });
      } else {
        const isMoved = await isFolderMovedInSameRoot({
          connectorId,
          folder: driveItem,
          internalId,
        });
        const resource = await MicrosoftNodeResource.updateOrCreate(
          connectorId,
          itemToMicrosoftNode("folder", driveItem)
        );

        // add parent information to new node resource. for the toplevel folder,
        // parent is null
        // todo check filter
        const parentInternalId =
          resource.internalId === driveId ||
          rootNodeIds.indexOf(resource.internalId) !== -1
            ? null
            : getParentReferenceInternalId(driveItem.parentReference);

        await resource.update({
          parentInternalId,
          lastSeenTs: new Date(),
        });

        if (isMoved) {
          await updateDescendantsParentsInQdrant({
            dataSourceConfig,
            folder: resource,
            startSyncTs,
          });
        }
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

/**
 *  As per recommendation, remove all but the last occurences of the same
 *  driveItem in the list
 */
function removeAllButLastOccurences(deltaList: microsoftgraph.DriveItem[]) {
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
 * - first those whose parentInternalId is not in the changedList, or the root drive
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

  const internalIds = changedList.map((item) => getDriveItemInternalId(item));

  const sortedItemList = changedList.filter((item) => {
    if (!item.parentReference) {
      return false;
    }

    if (rootId && item.id === rootId) {
      // Found selected root
      return true;
    }

    if (!rootId && !item.parentReference.id) {
      // Root folder of the drive, always include it
      return true;
    }

    const parentInternalId = getParentReferenceInternalId(item.parentReference);
    return !internalIds.includes(parentInternalId);
  });

  for (;;) {
    const nextLevel = changedList.filter((item) => {
      if (sortedItemList.includes(item)) {
        return false;
      }

      // not needed, but just to please TS
      if (!item.parentReference) {
        return true;
      }

      const parentInternalId = getParentReferenceInternalId(
        item.parentReference
      );

      return sortedItemList.some(
        (sortedItem) => getDriveItemInternalId(sortedItem) === parentInternalId
      );
    });

    if (nextLevel.length === 0) {
      return sortedItemList;
    }

    sortedItemList.push(...nextLevel);
  }
}

async function getDeltaData({
  client,
  node,
}: {
  client: Client;
  node: MicrosoftNodeResource;
}) {
  if (!node.deltaLink) {
    throw new Error(`No delta link for root node ${node.internalId}`);
  }

  try {
    return await getFullDeltaResults(client, node.internalId, node.deltaLink);
  } catch (e) {
    if (e instanceof GraphError && e.statusCode === 410) {
      // API is answering 'resync required'
      // we repopulate the delta from scratch
      return await getFullDeltaResults(client, node.internalId);
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

async function updateDescendantsParentsInQdrant({
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
  await concurrentExecutor(
    files,
    async (file) => updateParentsField({ file, dataSourceConfig, startSyncTs }),
    {
      concurrency: 10,
    }
  );
  for (const childFolder of folders) {
    await updateDescendantsParentsInQdrant({
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
    parentInternalId: file.parentInternalId,
    startSyncTs,
  });

  await updateDocumentParentsField({
    dataSourceConfig,
    documentId: file.internalId,
    parents,
  });
}

export async function microsoftDeletionActivity({
  connectorId,
  nodeIdsToDelete,
}: {
  connectorId: ModelId;
  nodeIdsToDelete: string[];
}): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const results = await concurrentExecutor(
    nodeIdsToDelete,
    async (nodeId) =>
      recursiveNodeDeletion(nodeId, connectorId, dataSourceConfig),
    { concurrency: DELETE_CONCURRENCY }
  );

  const errors = results.filter((r): r is Err<Error> => r.isErr());
  if (errors.length > 0) {
    logger.error(
      { connectorId, errors: errors.map((e) => e.error.message) },
      "Microsoft deletion workflow completed with errors"
    );
    return new Err(
      new Error("Microsoft deletion workflow completed with errors")
    );
  }
  return new Ok(undefined);
}
