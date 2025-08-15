import {
  ScheduleAlreadyRunning,
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
import { LightTriggerType } from "@app/types/assistant/triggers";

export async function createOrUpdateAgentScheduleWorkflow({
  authType,
  agentConfigurationId,
  trigger,
}: {
  authType: AuthenticatorType;
  agentConfigurationId: number;
  trigger: LightTriggerType;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = `agent-schedule-${authType.workspaceId}-${agentConfigurationId}-${trigger.sId}`;

  if (trigger.kind !== "schedule") {
    logger.error(
      { triggerKind: trigger.kind },
      "Trigger is not of kind 'schedule'."
    );
    return new Err(new Error("Trigger is not of kind 'schedule'"));
  }

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: agentScheduleWorkflow,
        args: [authType, agentConfigurationId, trigger],
        taskQueue: QUEUE_NAME,
      },
      scheduleId,
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        cronExpressions: [trigger.config.cron],
      },
    });

    logger.info(
      {
        scheduleId,
      },
      "Scheduled workflow."
    );
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) {
      logger.error({}, "Failed to schedule workflow.");

      return new Err(normalizeError(err));
    }
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
