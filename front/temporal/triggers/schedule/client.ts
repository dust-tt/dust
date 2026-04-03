import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME as COMMON_QUEUE_NAME } from "@app/temporal/triggers/common/config";
import { agentTriggerWorkflow } from "@app/temporal/triggers/common/workflows";
import type {
  IntervalScheduleConfig,
  ScheduleConfig,
  ScheduleTriggerType,
} from "@app/types/assistant/triggers";
import {
  isCronScheduleConfig,
  isScheduleTrigger,
} from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { ScheduleOptions, ScheduleSpec } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import moment from "moment-timezone";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert local hour/minute in a given IANA timezone to a UTC-based
 * millisecond-of-day value. Uses the current UTC offset of the timezone,
 * so DST changes may shift the firing time by ~1h (accepted trade-off).
 */
function localTimeToUtcMs(
  hour: number,
  minute: number,
  timezone: string
): number {
  const localTime = moment.tz({ hour, minute }, timezone);
  const utcHour = localTime.utc().hour();
  const utcMinute = localTime.utc().minute();
  return (utcHour * 60 + utcMinute) * 60 * 1000;
}

/**
 * Compute the epoch-based offset for Temporal's IntervalSpec.
 * Temporal fires at: epoch + offset + n * every.
 * Epoch (Jan 1, 1970 00:00 UTC) was a Thursday (dayOfWeek=4).
 */
function computeIntervalOffsetMs(config: IntervalScheduleConfig): number {
  const utcTimeMs = localTimeToUtcMs(
    config.hour,
    config.minute,
    config.timezone
  );

  if (config.dayOfWeek !== null) {
    // Week-aligned: offset to reach target day-of-week from epoch Thursday.
    const epochDayOfWeek = 4; // Thursday
    const offsetDays = (config.dayOfWeek - epochDayOfWeek + 7) % 7;
    return offsetDays * DAY_MS + utcTimeMs;
  }

  // Pure day interval: just set the time-of-day offset.
  return utcTimeMs;
}

function buildScheduleSpec(config: ScheduleConfig): ScheduleSpec {
  if (isCronScheduleConfig(config)) {
    return {
      cronExpressions: [config.cron],
      timezone: config.timezone,
    };
  }

  // Interval-based (N-day, N-week).
  const everyMs = config.intervalDays * DAY_MS;
  const offsetMs = computeIntervalOffsetMs(config);
  return {
    intervals: [{ every: everyMs, offset: offsetMs }],
    // Note: timezone field on ScheduleSpec only applies to cron/calendar specs,
    // not intervals (which are epoch-based). The offset accounts for the target time.
  };
}

function getTriggerScheduleOptions(
  auth: Authenticator,
  triggerData: ScheduleTriggerType,
  scheduleId: string
): ScheduleOptions {
  return {
    action: {
      type: "startWorkflow",
      workflowType: agentTriggerWorkflow,
      args: [
        {
          userId: auth.getNonNullableUser().sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          triggerId: triggerData.sId,
        },
      ],
      taskQueue: COMMON_QUEUE_NAME,
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: buildScheduleSpec(triggerData.configuration),
  };
}

export function makeTriggerScheduleId(
  workspaceId: string,
  triggerId: string
): string {
  return `agent-schedule-${workspaceId}-${triggerId}`;
}

export async function createOrUpdateAgentSchedule({
  auth,
  trigger,
}: {
  auth: Authenticator;
  trigger: TriggerResource;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const workspace = auth.workspace();
  if (!workspace) {
    return new Err(new Error("Workspace ID is required"));
  }

  if (auth.getNonNullableUser().id !== trigger.editor) {
    /**
     * Only the editor of the trigger can create or update the schedule.
     * If the user is not the editor, we skip the creation/update.
     * This can happen when an admin does operation on a trigger.
     */
    logger.warn(
      {
        userId: auth.getNonNullableUser().sId,
        triggerId: trigger.sId,
        triggerEditorId: trigger.editor,
      },
      "User is not the editor of the trigger, skipping schedule creation/update."
    );
    return new Ok("");
  }

  const scheduleId = makeTriggerScheduleId(workspace.sId, trigger.sId);

  const childLogger = logger.child({
    workspaceId: workspace.sId,
    scheduleId,
    triggerId: trigger.sId,
    trigger: trigger.toJSON(),
  });

  const scheduleTrigger = trigger.toJSON();

  if (!isScheduleTrigger(scheduleTrigger)) {
    childLogger.error("Trigger is not a schedule.");
    return new Err(new Error("Trigger is not a schedule"));
  }

  const scheduleOptions = getTriggerScheduleOptions(
    auth,
    scheduleTrigger,
    scheduleId
  );

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

    childLogger.info("Updated existing schedule.");
    return new Ok(scheduleId);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      childLogger.error({ err }, "Failed to update existing schedule.");
      return new Err(normalizeError(err));
    }
  }

  /**
   * If we reach that point, it means the schedule does not exist,
   * so we create a new one.
   */
  try {
    await client.schedule.create(scheduleOptions);
    childLogger.info("Created new schedule.");
    return new Ok(scheduleId);
  } catch (error) {
    childLogger.error({ error }, "Failed to create new schedule.");
    return new Err(normalizeError(error));
  }
}

export async function deleteTriggerSchedule({
  workspaceId,
  trigger,
}: {
  workspaceId: string;
  trigger: TriggerResource;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = makeTriggerScheduleId(workspaceId, trigger.sId);

  const childLogger = logger.child({
    workspaceId,
    scheduleId,
    trigger: trigger.toJSON(),
  });

  try {
    const handle = client.schedule.getHandle(scheduleId);
    await handle.delete();
    childLogger.info({}, "Deleted scheduled workflow successfully.");
    return new Ok(undefined);
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      childLogger.warn({}, "Workflow not found, nothing to delete.");
      return new Ok(undefined);
    }

    childLogger.error({ err }, "Failed to delete scheduled workflow.");
    return new Err(normalizeError(err));
  }
}
