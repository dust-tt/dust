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
  internalIdFromTypeAndPath,
  itemToMicrosoftNode,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { MicrosoftNode } from "@connectors/connectors/microsoft/lib/types";
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

export async function groupRootItemsByDriveId(
  connectorId: ModelId,
  nodeIds: string[]
) {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const client = await getClient(connector.connectionId);

  const itemsWithDrive = await Promise.all(
    nodeIds.map(async (id) => {
      const typeAndPath = typeAndPathFromInternalId(id);
      if (typeAndPath.nodeType === "folder") {
        const folder = await getItem(client, typeAndPath.itemAPIPath);
        return {
          drive: getDriveInternalIdFromItem(folder),
          folder: getDriveItemInternalId(folder),
        };
      } else if (typeAndPath.nodeType === "drive") {
        return { drive: id, folder: id };
      }
    })
  );

  return itemsWithDrive.reduce(
    (acc: { [key: string]: string[] }, current) =>
      current
        ? {
            [current.drive]: acc[current.drive]
              ? [...(acc[current.drive] as string[]), current.folder]
              : [current.folder],
          }
        : acc,
    {} as { [key: string]: string[] }
  );
}

export async function populateDeltas(connectorId: ModelId, nodeIds: string[]) {
  const groupedItems = await groupRootItemsByDriveId(connectorId, nodeIds);
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const client = await getClient(connector.connectionId);

  for (const driveId of Object.keys(groupedItems)) {
    if (groupedItems[driveId]) {
      const { deltaLink } = await getDeltaResults({
        client,
        parentInternalId: driveId,
        token: "latest",
      });

      for (const nodeId of groupedItems[driveId]) {
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

export async function syncDeltaForRootNode({
  connectorId,
  driveId,
  parentIds,
  startSyncTs,
}: {
  connectorId: ModelId;
  driveId: string;
  parentIds: string[];
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

  const nodeTypes = parentIds.map(
    (nodeId) => typeAndPathFromInternalId(nodeId).nodeType
  );

  if (
    nodeTypes.some((nodeType) => nodeType !== "drive" && nodeType !== "folder")
  ) {
    throw new Error(`Some of ${parentIds} are not a drive or folder`);
  }

  const nodes = await Promise.all(
    parentIds.map((id) =>
      MicrosoftNodeResource.fetchByInternalId(connectorId, id)
    )
  );

  if (nodes.some((n) => !n)) {
    throw new Error(`Root or node resource ${nodes} not found`);
  }

  const client = await getClient(connector.connectionId);

  logger.info({ connectorId, parentIds }, "Syncing delta for node");

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
    node: nodes[0] as MicrosoftNodeResource,
  });
  const uniqueChangedItems = removeAllButLastOccurences(results);
  const sortedChangedItems = sortForIncrementalUpdate(uniqueChangedItems);

  for (const driveItem of sortedChangedItems) {
    heartbeat();

    if (!driveItem.parentReference) {
      throw new Error(`Unexpected: parent reference missing: ${driveItem}`);
    }

    const internalId = getDriveItemInternalId(driveItem);

    // TODO filter from parentId

    if (driveItem.file) {
      if (driveItem.deleted) {
        // if file was just moved from a toplevel folder to another in the same drive, it's marked
        // as deleted but we don't want to delete it
        // internally means "in the same Drive" here
        // TODO : check if the file is moved from all parent folders
        // if (
        //   !(await isFileMovedInSameDrive({
        //     toplevelNode: drive,
        //     fileInternalId: internalId,
        //   }))
        // ) {
        //   await deleteFile({ connectorId, internalId, dataSourceConfig });
        // }
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
          resource.internalId === driveId
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

  await Promise.all(nodes.map((node) => node && node.update({ deltaLink })));

  logger.info({ connectorId, driveId, parentIds }, "Delta sync complete");
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
 * This function checks whether a file marked as deleted from a toplevel folder
 * is actually just moved to another toplevel folder in the same drive (in which
 * case we should not delete it)
 *
 * Note: this concerns toplevel folders, not drives; it's fine to delete files
 * that move from a drive to another because they change id
 */
async function isFileMovedInSameDrive({
  toplevelNode,
  fileInternalId,
}: {
  toplevelNode: MicrosoftNodeResource;
  fileInternalId: string;
}) {
  if (toplevelNode.nodeType === "drive") {
    // if the toplevel node is a drive, then the deletion must happen
    return false;
  }
  // check that the file's parents array does not contain the toplevel folder, in
  // which case it's a file movement; otherwise it's a file deletion
  return !(
    await getParents({
      connectorId: toplevelNode.connectorId,
      internalId: fileInternalId,
      parentInternalId: toplevelNode.internalId,
      startSyncTs: new Date().getTime(),
    })
  ).includes(toplevelNode.internalId);
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
function sortForIncrementalUpdate(changedList: DriveItem[]) {
  if (changedList.length === 0) {
    return [];
  }

  const internalIds = changedList.map((item) => getDriveItemInternalId(item));

  const sortedDriveItemList = changedList.filter((item) => {
    if (!item.parentReference) {
      return true;
    }

    if (item.root) {
      return true;
    }

    const parentInternalId = getParentReferenceInternalId(item.parentReference);
    return !internalIds.includes(parentInternalId);
  });

  while (sortedDriveItemList.length < changedList.length) {
    const nextLevel = changedList.filter((item) => {
      if (sortedDriveItemList.includes(item)) {
        return false;
      }

      // not needed, but just to please TS
      if (!item.parentReference) {
        return true;
      }

      const parentInternalId = getParentReferenceInternalId(
        item.parentReference
      );
      return sortedDriveItemList.some(
        (sortedItem) => getDriveItemInternalId(sortedItem) === parentInternalId
      );
    });

    sortedDriveItemList.push(...nextLevel);
  }

  return sortedDriveItemList;
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
