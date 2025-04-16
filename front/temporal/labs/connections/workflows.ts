import { proxyActivities } from "@temporalio/workflow";

import type { ModelId } from "@app/types";

import type * as activities from "./activities";

const {
  fullSyncLabsConnectionActivity,
  incrementalSyncLabsConnectionActivity,
  startIncrementalSyncActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function fullSyncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  // Run full sync
  await fullSyncLabsConnectionActivity(configurationId);

  // Start incremental sync workflow after full sync completes
  await startIncrementalSyncActivity(configurationId);
}

export async function incrementalSyncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  await incrementalSyncLabsConnectionActivity(configurationId);
}
