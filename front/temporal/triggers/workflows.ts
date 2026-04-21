import type { ContentFragmentInputWithFileIdType } from "@app/types/api/internal/assistant";
import { ActivityFailure, RetryState } from "@temporalio/common";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { runTriggeredAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

const { expireWakeUpActivity, runWakeUpActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 6,
    maximumInterval: "5 minutes",
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

function isWakeUpActivityRetryExhausted(
  error: unknown
): error is ActivityFailure {
  if (!(error instanceof ActivityFailure)) {
    return false;
  }

  if (error.activityType !== "runWakeUpActivity") {
    return false;
  }

  return (
    error.retryState === RetryState.MAXIMUM_ATTEMPTS_REACHED ||
    error.retryState === RetryState.TIMEOUT
  );
}

export async function wakeUpWorkflow({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  try {
    await runWakeUpActivity({ workspaceId, wakeUpId });
  } catch (error) {
    if (isWakeUpActivityRetryExhausted(error)) {
      await expireWakeUpActivity({ workspaceId, wakeUpId });
      return;
    }

    throw error;
  }
}
