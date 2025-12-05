import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/triggers/webhook/activities";

const { webhookCleanupActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

export async function webhookCleanupWorkflow() {
  await webhookCleanupActivity();
}
