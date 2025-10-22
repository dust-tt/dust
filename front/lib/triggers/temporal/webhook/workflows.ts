import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { runTriggerWebhookActivity, webhookCleanupActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

export async function agentTriggerWebhookWorkflow(
  workspaceId: string,
  webhookRequestId: number
) {
  await runTriggerWebhookActivity({
    workspaceId,
    webhookRequestId,
  });
}

export async function webhookCleanupWorkflow() {
  await webhookCleanupActivity();
}
