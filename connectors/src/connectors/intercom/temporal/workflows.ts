import { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/intercom/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

// This is how to import your activities.
const { syncHelpCentersActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { saveIntercomConnectorStartSync, saveIntercomConnectorSuccessSync } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

/**
 * Workflow that syncs all help centers for a given connector:
 * Inside a Help Center, we sync the Collections and the Articles.
 */
export async function intercomHelpCentersSyncWorkflow({
  connectorId,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
}) {
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  // Eventually here we want to know for which help center we are syncing.
  // In the meantime we are syncing all help centers.
  await saveIntercomConnectorStartSync({ connectorId });
  await syncHelpCentersActivity({
    connectorId,
    dataSourceConfig,
    loggerArgs,
  });
  await saveIntercomConnectorSuccessSync({ connectorId });
}
