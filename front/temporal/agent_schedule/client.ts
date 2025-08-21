import {
  Client,
  ScheduleHandle,
  ScheduleNotFoundError,
  ScheduleOptions,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { QUEUE_NAME } from "@app/temporal/agent_schedule/config";
import { agentScheduleWorkflow } from "@app/temporal/agent_schedule/workflows";
import { AuthenticatorType } from "@app/lib/auth";
import { TriggerType } from "@app/types/assistant/triggers";

function getScheduleOptions(
  authType: AuthenticatorType,
  trigger: TriggerType,
  scheduleId: string
): ScheduleOptions {
  return {
    action: {
      type: "startWorkflow",
      workflowType: agentScheduleWorkflow,
      args: [authType, trigger],
      taskQueue: QUEUE_NAME,
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: {
      cronExpressions: [trigger.config.cron],
      timezone: trigger.config.timezone,
    },
  };
}

function makeScheduleId(workspaceId: string, triggerId: string): string {
  return `agent-schedule-${workspaceId}-${triggerId}`;
}

export async function createOrUpdateAgentScheduleWorkflow({
  authType,
  trigger,
}: {
  authType: AuthenticatorType;
  trigger: TriggerType;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  if (!authType.workspaceId) {
    return new Err(new Error("Workspace ID is required"));
  }

  const scheduleId = makeScheduleId(authType.workspaceId, trigger.sId);

  const childLogger = logger.child({
    workspaceId: authType.workspaceId,
  });

  if (trigger.kind !== "schedule") {
    childLogger.error(
      { triggerConfig: trigger.config },
      "Trigger is not a schedule."
    );
    return new Err(new Error("Trigger is not a schedule"));
  }

  const scheduleOptions = getScheduleOptions(authType, trigger, scheduleId);

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

    childLogger.info({ scheduleId, trigger }, "Updated existing schedule.");
    return new Ok(scheduleId);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      childLogger.error(
        { err, scheduleId, trigger },
        "Failed to update existing schedule."
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
    childLogger.info({ scheduleId, trigger }, "Created new schedule.");
    return new Ok(scheduleId);
  } catch (error) {
    childLogger.error(
      { error, scheduleId, trigger },
      "Failed to create new schedule."
    );
    return new Err(normalizeError(error));
  }
}

export async function deleteAgentScheduleWorkflow({
  workspaceId,
  triggerId,
}: {
  workspaceId: string;
  triggerId: string;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = makeScheduleId(workspaceId, triggerId);

  const childLogger = logger.child({
    workspaceId,
  });

  try {
    const handle = client.schedule.getHandle(scheduleId);
    await handle.delete();
    childLogger.info(
      { scheduleId },
      "Deleted scheduled workflow successfully."
    );
    return new Ok(undefined);
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      childLogger.warn(
        { scheduleId },
        "Workflow not found, nothing to delete."
      );
      return new Ok(undefined);
    }

    childLogger.error({ err }, "Failed to delete scheduled workflow.");
    return new Err(normalizeError(err));
  }
}
