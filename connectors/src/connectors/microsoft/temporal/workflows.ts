import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";

const { getSiteNodesToSync, syncFiles, markNodeAsVisited } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "20 minutes",
});

const { reportInitialSyncProgress, syncSucceeded } = proxyActivities<
  typeof sync_status
>({
  startToCloseTimeout: "10 minutes",
});

export async function fullSyncWorkflow({
  connectorId,
  startSyncTs = undefined,
}: {
  connectorId: ModelId;
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
    args: [{ connectorId, startSyncTs }],
    memo: workflowInfo().memo,
  });
}

export async function fullSyncSitesWorkflow({
  connectorId,
  startSyncTs,
  nodeIdsToSync = undefined,
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

    await markNodeAsVisited(connectorId, nodeId);

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

export function microsoftFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-${connectorId}`;
}

export function microsoftFullSyncSitesWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-sites-${connectorId}`;
}
