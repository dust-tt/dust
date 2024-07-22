import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";

const { getSiteNodesToSync, syncFiles, markNodeAsSeen, populateDeltas } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "30 minutes",
  });

const { syncDeltaForRoot: syncDeltaForNode } = proxyActivities<
  typeof activities
>({
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
  nodeIdsToSync,
  startSyncTs = undefined,
}: {
  connectorId: ModelId;
  nodeIdsToSync?: string[];
  startSyncTs?: number;
}) {
  if (startSyncTs === undefined) {
    startSyncTs = new Date().getTime();
  }

  await executeChild(fullSyncSitesWorkflow, {
    workflowId: microsoftFullSyncSitesWorkflowId(connectorId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    args: [{ connectorId, startSyncTs, nodeIdsToSync }],
    memo: workflowInfo().memo,
  });
}

export async function fullSyncSitesWorkflow({
  connectorId,
  startSyncTs,
  nodeIdsToSync,
  totalCount = 0,
}: {
  connectorId: ModelId;
  startSyncTs: number;
  nodeIdsToSync?: string[];
  totalCount?: number;
}) {
  if (nodeIdsToSync === undefined) {
    nodeIdsToSync = await getSiteNodesToSync(connectorId);
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
      await continueAsNew<typeof fullSyncSitesWorkflow>({
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
  const nodeIdsToSync = await getSiteNodesToSync(connectorId);
  const startSyncTs = new Date().getTime();
  for (const nodeId of nodeIdsToSync) {
    await syncDeltaForNode({
      connectorId,
      rootId: nodeId,
      startSyncTs,
    });
  }

  await sleep("5 minutes");
  await continueAsNew<typeof incrementalSyncWorkflow>({
    connectorId,
  });
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
