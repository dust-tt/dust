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

export async function launchScheduledAgentCallWorkflow({
  authType,
  agentConfigurationId,
  trigger,
}: {
  authType: AuthenticatorType;
  agentConfigurationId: string;
  trigger: LightTriggerType;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleId = `scheduled-agent-call-${authType.workspaceId}-${agentConfigurationId}`;

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
