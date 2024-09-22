import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type { FolderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import { folderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";

const {
  getRootNodesToSync,
  syncFiles,
  markNodeAsSeen,
  populateDeltas,
  groupRootItemsByDriveId,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

const { microsoftDeletionActivity, microsoftGarbageCollectionActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "15 minutes",
  });

const { syncDeltaForRootNodesInDrive } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  heartbeatTimeout: "5 minutes",
});

const { reportInitialSyncProgress, syncSucceeded, syncStarted } =
  proxyActivities<typeof sync_status>({
    startToCloseTimeout: "10 minutes",
  });

export async function fullSyncWorkflow({
  connectorId,
  startSyncTs,
  nodeIdsToSync = [],
  nodeIdsToDelete = [],
  totalCount = 0,
}: {
  connectorId: ModelId;
  startSyncTs?: number;
  nodeIdsToSync?: string[];
  nodeIdsToDelete?: string[];
  totalCount?: number;
}) {
  await syncStarted(connectorId);

  setHandler(folderUpdatesSignal, (folderUpdates: FolderUpdatesSignal[]) => {
    // If we get a signal, update the workflow state by adding/removing folder ids.
    for (const { action, folderId } of folderUpdates) {
      switch (action) {
        case "added":
          if (nodeIdsToDelete.includes(folderId)) {
            nodeIdsToDelete.splice(nodeIdsToDelete.indexOf(folderId), 1);
          }
          nodeIdsToSync.push(folderId);
          break;
        case "removed":
          if (nodeIdsToSync.includes(folderId)) {
            nodeIdsToSync.splice(nodeIdsToSync.indexOf(folderId), 1);
          }
          nodeIdsToDelete.push(folderId);
          break;
        default:
        //
      }
    }
  });

  if (startSyncTs === undefined) {
    startSyncTs = new Date().getTime();
  }

  await populateDeltas(connectorId, nodeIdsToSync);

  let nextPageLink: string | undefined = undefined;

  while (nodeIdsToSync.length > 0) {
    // First, delete any nodes that were removed
    if (nodeIdsToDelete.length > 0) {
      await microsoftDeletionActivity({
        connectorId,
        nodeIdsToDelete: nodeIdsToDelete.splice(0, nodeIdsToDelete.length),
      });
    }

    const nodeId = nodeIdsToSync.pop();

    if (!nodeId) {
      throw new Error("Unreachable: node is undefined");
    }

    do {
      const res = await syncFiles({
        connectorId,
        parentInternalId: nodeId,
        startSyncTs,
        nextPageLink,
      });
      totalCount += res.count;
      nodeIdsToSync = nodeIdsToSync.concat(res.childNodes);
      nextPageLink = res.nextLink;

      await reportInitialSyncProgress(
        connectorId,
        `Synced ${totalCount} files`
      );
    } while (nextPageLink);

    await markNodeAsSeen(connectorId, nodeId);

    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof fullSyncWorkflow>({
        connectorId,
        nodeIdsToSync,
        nodeIdsToDelete,
        totalCount,
        startSyncTs,
      });
    }
  }

  if (nodeIdsToDelete.length > 0) {
    await microsoftDeletionActivity({
      connectorId,
      nodeIdsToDelete: nodeIdsToDelete.splice(0, nodeIdsToDelete.length),
    });
  }

  await syncSucceeded(connectorId);

  if (nodeIdsToSync.length > 0 || nodeIdsToDelete.length > 0) {
    await continueAsNew<typeof fullSyncWorkflow>({
      connectorId,
      nodeIdsToSync,
      nodeIdsToDelete,
      totalCount,
      startSyncTs,
    });
  }
}

export async function incrementalSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await syncStarted(connectorId);

  const nodeIdsToSync = await getRootNodesToSync(connectorId);

  const groupedItems = await groupRootItemsByDriveId(nodeIdsToSync);

  const startSyncTs = new Date().getTime();
  for (const nodeId of Object.keys(groupedItems)) {
    await syncDeltaForRootNodesInDrive({
      connectorId,
      driveId: nodeId,
      rootNodeIds: groupedItems[nodeId] as string[],
      startSyncTs,
    });
  }

  await syncSucceeded(connectorId);

  await sleep("5 minutes");
  await continueAsNew<typeof incrementalSyncWorkflow>({
    connectorId,
  });
}

export async function microsoftGarbageCollectionWorkflow({
  connectorId,
}: {
  connectorId: number;
}) {
  const rootNodeIds = await getRootNodesToSync(connectorId);
  const startGarbageCollectionTs = new Date().getTime();
  let idCursor: number | null = 0;
  while (idCursor !== null) {
    idCursor = await microsoftGarbageCollectionActivity({
      connectorId,
      idCursor,
      rootNodeIds,
      startGarbageCollectionTs,
    });
    await sleep("1 minute");
  }
}

export function microsoftFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-${connectorId}`;
}

export function microsoftFullSyncSitesWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-sites-${connectorId}`;
}

export function microsoftIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-incrementalSync-${connectorId}`;
}

export function microsoftGarbageCollectionWorkflowId(connectorId: ModelId) {
  return `microsoft-garbageCollection-${connectorId}`;
}
