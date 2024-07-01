import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const { fullSyncActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
});

const { syncSucceeded } = proxyActivities<typeof sync_status>({
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

export function microsoftFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-${connectorId}`;
}
