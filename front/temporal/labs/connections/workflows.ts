import { proxyActivities } from "@temporalio/workflow";

import type { ModelId } from "@app/types";

import type * as activities from "./activities";
const { syncLabsConnectionActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function syncLabsConnectionWorkflow(
  configurationId: ModelId
): Promise<void> {
  await syncLabsConnectionActivity(configurationId);
}
