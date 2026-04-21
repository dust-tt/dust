import type { ContentFragmentInputWithFileIdType } from "@app/types/api/internal/assistant";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { runTriggeredAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

const { runWakeUpActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["WakeUpNonRetryableError"],
  },
});

export async function agentTriggerWorkflow({
  userId,
  workspaceId,
  triggerId,
  contentFragment,
  webhookRequestId,
}: {
  userId: string;
  workspaceId: string;
  triggerId: string;
  contentFragment?: ContentFragmentInputWithFileIdType;
  webhookRequestId?: number;
}) {
  await runTriggeredAgentsActivity({
    userId,
    workspaceId,
    triggerId,
    contentFragment,
    webhookRequestId,
  });
}

export async function wakeUpWorkflow({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  await runWakeUpActivity({ workspaceId, wakeUpId });
}
