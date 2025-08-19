import {
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { agentScheduleWorkflow } from "./workflows";
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

  if (trigger.kind !== "schedule") {
    logger.error(
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
    logger.info(
      {
        wId: authType.workspaceId,
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

    logger.info(
      {
        scheduleId,
      },
      "Scheduled workflow."
    );
  } catch (err) {
    logger.error(
      {
        err,
        wId: authType.workspaceId,
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

  try {
    const handle = client.schedule.getHandle(scheduleId);
    await handle.delete();
    logger.info({ scheduleId }, "Deleted scheduled workflow successfully.");
    return new Ok(undefined);
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      logger.warn({ scheduleId }, "Workflow not found, nothing to delete.");
      return new Ok(undefined);
    }

    logger.error({ err }, "Failed to delete scheduled workflow.");
    return new Err(normalizeError(err));
  }
}
