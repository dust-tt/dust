import type { ScheduleOptions } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/agent_schedule/config";
import { agentScheduleWorkflow } from "@app/temporal/agent_schedule/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { ScheduleTriggerType } from "@app/types/assistant/triggers";
import { isScheduleTrigger } from "@app/types/assistant/triggers";

function getScheduleOptions(
  auth: Authenticator,
  triggerData: ScheduleTriggerType,
  scheduleId: string
): ScheduleOptions {
  return {
    action: {
      type: "startWorkflow",
      workflowType: agentScheduleWorkflow,
      args: [
        auth.getNonNullableUser().sId,
        auth.getNonNullableWorkspace().sId,
        triggerData,
      ],
      taskQueue: QUEUE_NAME,
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: {
      cronExpressions: [triggerData.configuration.cron],
      timezone: triggerData.configuration.timezone,
    },
  };
}

export function makeScheduleId(workspaceId: string, triggerId: string): string {
  return `agent-schedule-${workspaceId}-${triggerId}`;
}

export async function createOrUpdateAgentScheduleWorkflow({
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

  const scheduleId = makeScheduleId(workspace.sId, trigger.sId());

  const childLogger = logger.child({
    workspaceId: workspace.sId,
    scheduleId,
    triggerId: trigger.sId(),
    trigger: trigger.toJSON(),
  });

  const scheduleTrigger = trigger.toJSON();

  if (!isScheduleTrigger(scheduleTrigger)) {
    childLogger.error("Trigger is not a schedule.");
    return new Err(new Error("Trigger is not a schedule"));
  }

  const scheduleOptions = getScheduleOptions(auth, scheduleTrigger, scheduleId);

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

export async function deleteAgentScheduleWorkflow({
  workspaceId,
  trigger,
}: {
  workspaceId: string;
  trigger: TriggerResource;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = makeScheduleId(workspaceId, trigger.sId());

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
