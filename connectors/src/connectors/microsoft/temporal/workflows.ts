import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";
import type { MicrosoftNodeType } from "@connectors/resources/microsoft_resource";

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
  nodesToSync = undefined,
  totalCount = 0,
}: {
  connectorId: ModelId;
  startSyncTs: number;
  nodesToSync?: MicrosoftNodeType[];
  totalCount?: number;
}) {
  if (nodesToSync === undefined) {
    nodesToSync = await getSiteNodesToSync(connectorId);
  }

  while (nodesToSync.length > 0) {
    const node = nodesToSync.pop();

    if (!node) {
      throw new Error("Unreachable: node is undefined");
    }

    const res = await syncFiles({
      connectorId,
      parent: node,
      startSyncTs,
    });
    totalCount += res.count;
    nodesToSync = nodesToSync.concat(res.childNodes);

    await reportInitialSyncProgress(connectorId, `Synced ${totalCount} files`);
    // TODO(pr): add pagination support
    await markNodeAsVisited(connectorId, node);
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof fullSyncSitesWorkflow>({
        connectorId,
        nodesToSync,
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
