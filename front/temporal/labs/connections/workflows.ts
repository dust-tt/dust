import { proxyActivities } from "@temporalio/workflow";

import { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { launchIncrementalSyncLabsConnectionWorkflow } from "@app/temporal/labs/connections/client";
import type { ModelId } from "@app/types";

import type * as activities from "./activities";

const {
  fullSyncLabsConnectionActivity,
  incrementalSyncLabsConnectionActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function fullSyncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  await fullSyncLabsConnectionActivity(configurationId);
  const connectionConfiguration =
    await LabsConnectionsConfigurationResource.fetchByModelId(configurationId);
  if (connectionConfiguration) {
    await launchIncrementalSyncLabsConnectionWorkflow(connectionConfiguration);
  }
}

export async function incrementalSyncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  await incrementalSyncLabsConnectionActivity(configurationId);
  const connectionConfiguration =
    await LabsConnectionsConfigurationResource.fetchByModelId(configurationId);
  if (connectionConfiguration) {
    await launchIncrementalSyncLabsConnectionWorkflow(connectionConfiguration);
  }
}
