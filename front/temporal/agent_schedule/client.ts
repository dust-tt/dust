import {
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { QUEUE_NAME } from "@app/temporal/agent_schedule/config";
import { agentScheduleWorkflow } from "@app/temporal/agent_schedule/workflows";
import { AuthenticatorType } from "@app/lib/auth";
import { TriggerType } from "@app/types/assistant/triggers";

export async function createOrUpdateAgentScheduleWorkflow({
  authType,
  trigger,
}: {
  authType: AuthenticatorType;
  trigger: TriggerType;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = `agent-schedule-${authType.workspaceId}-${trigger.agentConfigurationId}-${trigger.sId}`;

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

  /**
   * First, we try to get and update the existing schedule
   */
  try {
    const handle = client.schedule.getHandle(scheduleId);
    await handle.update((previous) => {
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
        state: previous.state,
      };
    });

    return new Ok(scheduleId);
  } catch {
    childLogger.info(
      {
        trigger,
      },
      "Creating a new schedule."
    );
  }

  /**
   * If we're still here, it means the schedule does not exist yet,
   * so we create a new one.
   */
  try {
    await client.schedule.create({
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
    });

    childLogger.info(
      {
        scheduleId,
      },
      "Scheduled workflow."
    );
  } catch (err) {
    childLogger.error(
      {
        err,
        trigger,
      },
      "Failed to schedule workflow."
    );

    return new Err(normalizeError(err));
  }

  return new Ok(scheduleId);
}

export async function deleteAgentScheduleWorkflow({
  authType,
  agentConfigurationId,
  triggerId,
}: {
  authType: AuthenticatorType;
  agentConfigurationId: number;
  triggerId: string;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = `agent-schedule-${authType.workspaceId}-${agentConfigurationId}-${triggerId}`;

  const childLogger = logger.child({
    workspaceId: authType.workspaceId,
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
    if (err instanceof WorkflowNotFoundError) {
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
