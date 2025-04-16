import { proxyActivities, sleep } from "@temporalio/workflow";

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

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function fullSyncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  await fullSyncLabsConnectionActivity(configurationId);
  await sleep(ONE_HOUR_MS);
  await startIncrementalSyncActivity(configurationId);
}

export async function incrementalSyncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  await incrementalSyncLabsConnectionActivity(configurationId);
  await sleep(ONE_HOUR_MS);
  await startIncrementalSyncActivity(configurationId);
}
