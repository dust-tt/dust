import { proxyActivities } from "@temporalio/workflow";

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
}

export async function incrementalSyncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  await incrementalSyncLabsConnectionActivity(configurationId);
}
