import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import type { Result } from "@app/types";
import { Ok } from "@app/types";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { QUEUE_NAME as WEBHOOK_QUEUE_NAME } from "@app/lib/triggers/temporal/webhook/config";
import { webhookCleanupWorkflow } from "@app/lib/triggers/temporal/webhook/workflows";
import logger from "@app/logger/logger";
import { Err, normalizeError } from "@app/types";

export const WEBHOOK_CLEANUP_SCHEDULE_ID = "webhook-cleanup-schedule";

export async function createOrUpdateWebhookCleanupSchedule(): Promise<
  Result<void, Error>
> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = WEBHOOK_CLEANUP_SCHEDULE_ID;
  const scheduleOptions = {
    action: {
      type: "startWorkflow" as const,
      workflowType: webhookCleanupWorkflow,
      args: [],
      taskQueue: WEBHOOK_QUEUE_NAME,
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: {
      // Every hour at minute 0
      cronExpressions: ["0 * * * *"] as string[],
      timezone: "UTC",
    },
  } as const;
  /**
   * First, we try to get and update the existing schedule
   */
  const existingSchedule = client.schedule.getHandle(scheduleId);
  try {
    await existingSchedule.update((previous) => {
      return {
        ...scheduleOptions,
        state: previous.state,
      };
    });

    logger.info("Updated existing webhook cleanup schedule.");
    return new Ok(undefined);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      logger.error(
        { err },
        "Failed to update existing webhook cleanup schedule."
      );
      return new Err(normalizeError(err));
    }
  }

  /**
   * If we reach that point, it means the schedule does not exist,
   * so we create a new one.
   */
  try {
    await client.schedule.create(scheduleOptions);
    logger.info("Created new webhook cleanup schedule.");
    return new Ok(undefined);
  } catch (error) {
    logger.error({ error }, "Failed to create new webhook cleanup schedule.");
    return new Err(normalizeError(error));
  }
}
