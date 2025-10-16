import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { runTriggerWebhookActivity } = proxyActivities<typeof activities>({
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
