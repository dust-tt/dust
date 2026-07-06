import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/triggers_garbage_collect/config";
import {
  orphanedScheduleCleanupWorkflow,
  webhookCleanupWorkflow,
} from "@app/temporal/triggers_garbage_collect/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

export const WEBHOOK_CLEANUP_SCHEDULE_ID = "webhook-cleanup-schedule";
export const ORPHANED_SCHEDULE_CLEANUP_SCHEDULE_ID =
  "orphaned-schedule-cleanup-schedule";

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
      taskQueue: QUEUE_NAME,
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

export async function createOrUpdateOrphanedScheduleCleanupSchedule(): Promise<
  Result<void, Error>
> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = ORPHANED_SCHEDULE_CLEANUP_SCHEDULE_ID;
  const scheduleOptions = {
    action: {
      type: "startWorkflow" as const,
      workflowType: orphanedScheduleCleanupWorkflow,
      args: [],
      taskQueue: QUEUE_NAME,
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: {
      // Every day at 03:00 UTC.
      cronExpressions: ["0 3 * * *"] as string[],
      timezone: "UTC",
    },
  } as const;

  const existingSchedule = client.schedule.getHandle(scheduleId);
  try {
    await existingSchedule.update((previous) => {
      return {
        ...scheduleOptions,
        state: previous.state,
      };
    });

    logger.info("Updated existing orphaned schedule cleanup schedule.");
    return new Ok(undefined);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      logger.error(
        { err },
        "Failed to update existing orphaned schedule cleanup schedule."
      );
      return new Err(normalizeError(err));
    }
  }

  try {
    await client.schedule.create(scheduleOptions);
    logger.info("Created new orphaned schedule cleanup schedule.");
    return new Ok(undefined);
  } catch (error) {
    logger.error(
      { error },
      "Failed to create new orphaned schedule cleanup schedule."
    );
    return new Err(normalizeError(error));
  }
}
