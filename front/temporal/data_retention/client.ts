import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { localTimeOfDayToUtc } from "@app/lib/api/timezone";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkflowHandle } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { FRAMES_RETENTION_SCHEDULE_ID, QUEUE_NAME } from "./config";
import { runSignal } from "./signals";
import { dataRetentionWorkflow, framesRetentionWorkflow } from "./workflows";

export async function launchDataRetentionWorkflow(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const { hour: utcHour } = localTimeOfDayToUtc(0, 0, timezone);

  await client.workflow.signalWithStart(dataRetentionWorkflow, {
    args: [],
    taskQueue: QUEUE_NAME,
    workflowId: "data-retention-workflow",
    signal: runSignal,
    signalArgs: undefined,
    cronSchedule: `0 ${utcHour} * * 1-5`, // Every weekday at midnight in the region's timezone.
  });

  logger.info(
    { region, timezone, utcHour },
    "[Data Retention] Launched workflow."
  );

  return new Ok(undefined);
}

export async function stopDataRetentionWorkflow({
  stopReason,
}: {
  stopReason: string;
}) {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle: WorkflowHandle<typeof dataRetentionWorkflow> =
      client.workflow.getHandle("data-retention-workflow");
    await handle.terminate(stopReason);
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "[Data Retention] Failed stopping workflow."
    );
  }
}

/**
 * Daily sweep of expired Frame function invocations. Overlapping runs are skipped: a run that is
 * still draining a backlog must not be joined by the next one.
 */
export async function createOrUpdateFramesRetentionSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleOptions = {
    action: {
      type: "startWorkflow" as const,
      workflowType: framesRetentionWorkflow,
      args: [],
      taskQueue: QUEUE_NAME,
    },
    scheduleId: FRAMES_RETENTION_SCHEDULE_ID,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: {
      // Every day at 03:00 UTC, away from the midnight conversation retention run that shares
      // this queue.
      cronExpressions: ["0 3 * * *"] as string[],
      timezone: "UTC",
    },
  } as const;

  const existingSchedule = client.schedule.getHandle(
    FRAMES_RETENTION_SCHEDULE_ID
  );
  try {
    await existingSchedule.update((previous) => ({
      ...scheduleOptions,
      state: previous.state,
    }));
    logger.info("[Frames Retention] Updated existing schedule.");

    return new Ok(undefined);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      logger.error({ err }, "[Frames Retention] Failed to update schedule.");

      return new Err(normalizeError(err));
    }
  }

  try {
    await client.schedule.create(scheduleOptions);
    logger.info("[Frames Retention] Created schedule.");

    return new Ok(undefined);
  } catch (err) {
    logger.error({ err }, "[Frames Retention] Failed to create schedule.");

    return new Err(normalizeError(err));
  }
}
