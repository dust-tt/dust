import { isDevelopment } from "@app/types/shared/env";
import { ActivityFailure, RetryState } from "@temporalio/common";
import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "./activities";

// We spread the start time of triggers and wake-ups starting on the hour over 10 minutes to avoid all conversations starting at the same time.
const ON_THE_HOUR_JITTER_MS = 60 * 10 * 1000;

const getJitterMs = () => {
  if (isDevelopment()) {
    return 0;
  } else {
    return Math.floor(Math.random() * ON_THE_HOUR_JITTER_MS);
  }
};

const { getTriggerActivity, runTriggeredAgentsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

const { getWakeUpActivity, expireWakeUpActivity, runWakeUpActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
      initialInterval: "30 seconds",
      backoffCoefficient: 2,
      maximumAttempts: 3,
      maximumInterval: "5 minutes",
    },
  });

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
  // Avoid fetching the trigger if we know it's a webhook trigger.
  if (!webhookRequestId) {
    const trigger = await getTriggerActivity({
      userId,
      workspaceId,
      triggerId,
    });

    // For triggers starting on the hour, we will add a little bit of jitter to the start time to avoid all conversations starting at the same time
    if (
      trigger.kind === "schedule" &&
      trigger.configuration.type === "cron" &&
      trigger.configuration.cron.startsWith("0 ")
    ) {
      const jitterMs = getJitterMs();
      if (jitterMs > 0) {
        await sleep(jitterMs);
      }
    }
  }

  await runTriggeredAgentsActivity({
    userId,
    workspaceId,
    triggerId,
    webhookRequestId,
  });
}

function isRunWakeUpActivityFailure(error: unknown): error is ActivityFailure {
  if (!(error instanceof ActivityFailure)) {
    return false;
  }

  return error.activityType === "runWakeUpActivity";
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
    const wakeUp = await getWakeUpActivity({ workspaceId, wakeUpId });
    if (!wakeUp) {
      return;
    }

    // For wake-ups starting on the hour, we will add a little bit of jitter to the start time to avoid all conversations starting at the same time
    if (
      wakeUp.status === "scheduled" &&
      wakeUp.scheduleConfig.type === "cron" &&
      wakeUp.scheduleConfig.cron.startsWith("0 ")
    ) {
      const jitterMs = getJitterMs();
      if (jitterMs > 0) {
        await sleep(jitterMs);
      }
    }

    await runWakeUpActivity({ workspaceId, wakeUpId });
  } catch (error) {
    if (isRunWakeUpActivityFailure(error)) {
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
