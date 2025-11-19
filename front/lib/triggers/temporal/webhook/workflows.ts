import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { webhookCleanupActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function webhookCleanupWorkflow() {
  await webhookCleanupActivity();
}
