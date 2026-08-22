import { ActivityFailure, RetryState } from "@temporalio/common";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { runTriggeredAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
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
    maximumAttempts: 3,
    maximumInterval: "5 minutes",
  },
});

function isActivityFailureOf(
  error: unknown,
  activityType: string
): error is ActivityFailure {
  if (!(error instanceof ActivityFailure)) {
    return false;
  }

  return error.activityType === activityType;
}

export async function agentTriggerWorkflow({
  userId,
  workspaceId,
  triggerId,
  webhookRequestId,
}: {
  userId: string;
  workspaceId: string;
  triggerId: string;
  webhookRequestId?: number;
}) {
  try {
    await runTriggeredAgentsActivity({
      userId,
      workspaceId,
      triggerId,
      webhookRequestId,
    });
  } catch (error) {
    // TriggerNonRetryableError marks expected terminal states (trigger deleted
    // before the run, user or agent gone): there is nothing left to run, so the
    // workflow completes instead of failing.
    if (
      isActivityFailureOf(error, "runTriggeredAgentsActivity") &&
      error.retryState === RetryState.NON_RETRYABLE_FAILURE
    ) {
      return;
    }

    throw error;
  }
}

function isWakeUpActivityRetryExhausted(error: ActivityFailure): boolean {
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
    if (isActivityFailureOf(error, "runWakeUpActivity")) {
      // Older workers used WakeUpNonRetryableError for expected stale wake-up states.
      if (error.retryState === RetryState.NON_RETRYABLE_FAILURE) {
        return;
      }

      if (isWakeUpActivityRetryExhausted(error)) {
        await expireWakeUpActivity({ workspaceId, wakeUpId });
        return;
      }
    }

    throw error;
  }
}
