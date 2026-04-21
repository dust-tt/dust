import type * as activities from "@app/temporal/triggers_garbage_collect/activities";
import { proxyActivities } from "@temporalio/workflow";

const { webhookCleanupActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

export async function webhookCleanupWorkflow() {
  await webhookCleanupActivity();
}
