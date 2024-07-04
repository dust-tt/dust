import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";

const { fullSyncActivity, getSiteNodesToSync, syncFiles, markNodeAsVisited } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "20 minutes",
  });

const { reportInitialSyncProgress, syncSucceeded } = proxyActivities<
  typeof sync_status
>({
  startToCloseTimeout: "10 minutes",
});

export async function fullSyncWorkflow({
  connectorId,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
}) {
  await fullSyncActivity({ connectorId, dataSourceConfig });
  await syncSucceeded(connectorId);
}

export async function fullSyncSitesWorkflow({
  connectorId,
  nodesToSync = undefined,
  totalCount = 0,
  startSyncTs = undefined,
}: {
  connectorId: ModelId;
  nodesToSync?: MicrosoftNodeResource[];
  totalCount: number;
  startSyncTs?: number;
}) {
  if (startSyncTs === undefined) {
    startSyncTs = new Date().getTime();
  }

  if (nodesToSync === undefined) {
    nodesToSync = await getSiteNodesToSync(connectorId);
  }

  while (nodesToSync.length > 0) {
    const node = nodesToSync.pop();

    if (!node) {
      throw new Error("Unreachable: node is undefined");
    }

    do {
      const res = await syncFiles({
        connectorId,
        parent: node,
        startSyncTs,
      });
      totalCount += res.count;
      nodesToSync = nodesToSync.concat(res.childNodes);

      await reportInitialSyncProgress(
        connectorId,
        `Synced ${totalCount} files`
      );
      // TODO(pr): add pagination support
    } while (false);
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
