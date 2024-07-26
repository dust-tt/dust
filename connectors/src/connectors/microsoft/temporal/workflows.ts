import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

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

const { microsoftDeletionActivity, microsoftNodesGCActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "15 minutes",
});

const { syncDeltaForRootNodesInDrive } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  heartbeatTimeout: "5 minutes",
});

const { reportInitialSyncProgress, syncSucceeded } = proxyActivities<
  typeof sync_status
>({
  startToCloseTimeout: "10 minutes",
});

export async function fullSyncWorkflow({
  connectorId,
  startSyncTs,
  nodeIdsToSync,
  totalCount = 0,
}: {
  connectorId: ModelId;
  startSyncTs?: number;
  nodeIdsToSync?: string[];
  totalCount?: number;
}) {
  if (nodeIdsToSync === undefined) {
    nodeIdsToSync = await getRootNodesToSync(connectorId);
  }

  if (startSyncTs === undefined) {
    startSyncTs = new Date().getTime();
  }

  await populateDeltas(connectorId, nodeIdsToSync);

  let nextPageLink: string | undefined = undefined;

  while (nodeIdsToSync.length > 0) {
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
        nodeIdsToSync: nodeIdsToSync,
        totalCount,
        startSyncTs,
      });
    }
  }

  await syncSucceeded(connectorId);
}

export async function incrementalSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
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

  await sleep("5 minutes");
  await continueAsNew<typeof incrementalSyncWorkflow>({
    connectorId,
  });
}

export async function microsoftDeletionWorkflow({
  connectorId,
  nodeIdsToDelete,
}: {
  connectorId: number;
  nodeIdsToDelete: string[];
}) {
  await microsoftDeletionActivity({ connectorId, nodeIdsToDelete });
}

export async function microsoftGarbageCollectionWorkflow({
  connectorId,
}: {
  connectorId: number;
}) {
  let idCursor = 0;
  while (idCursor !== null) {
    idCursor = await microsoftNodesGCActivity({ connectorId, idCursor });
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

export function microsoftDeletionWorkflowId(
  connectorId: ModelId,
  nodeIdsToDelete: string[]
) {
  function getLast4Chars(input: string) {
    return input.slice(-4);
  }

  // Sort the node IDs and concatenate the last 4 characters of each
  // up to 256 characters
  const sortedNodeIds = nodeIdsToDelete.sort();
  const concatenatedLast4Chars = sortedNodeIds
    .map(getLast4Chars)
    .join("")
    .slice(0, 256);

  return `microsoft-deletion-${connectorId}-${concatenatedLast4Chars}`;
}
