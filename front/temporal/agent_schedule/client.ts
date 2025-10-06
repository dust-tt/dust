import type { ScheduleOptions } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import { randomUUID } from "crypto";

import { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/agent_schedule/config";
import { agentTriggerWorkflow } from "@app/temporal/agent_schedule/workflows";
import type { ContentFragmentInputWithFileIdType, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type {
  ScheduleTriggerType,
  TriggerType,
} from "@app/types/assistant/triggers";
import { isScheduleTrigger } from "@app/types/assistant/triggers";
import { UserResource } from "@app/lib/resources/user_resource";

function getScheduleOptions(
  auth: Authenticator,
  triggerData: ScheduleTriggerType,
  scheduleId: string
): ScheduleOptions {
  return {
    action: {
      type: "startWorkflow",
      workflowType: agentTriggerWorkflow,
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

  if (auth.getNonNullableUser().id !== trigger.editor) {
    /**
     * Only the editor of the trigger can create or update the schedule.
     * If the user is not the editor, we skip the creation/update.
     * This can happen when an admin does operation on a trigger.
     */
    logger.warn(
      {
        userId: auth.getNonNullableUser().sId,
        triggerId: trigger.sId(),
        triggerEditorId: trigger.editor,
      },
      "User is not the editor of the trigger, skipping schedule creation/update."
    );
    return new Ok("");
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

export async function launchAgentTriggerWorkflow({
  auth,
  trigger,
  contentFragment,
}: {
  auth: Authenticator;
  trigger: TriggerResource;
  contentFragment?: ContentFragmentInputWithFileIdType;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeAgentTriggerWorkflowId(
    auth.getNonNullableUser().sId,
    auth.getNonNullableWorkspace().sId,
    trigger.toJSON()
  );

  await client.workflow.start(agentTriggerWorkflow, {
    args: [
      auth.getNonNullableUser().sId,
      auth.getNonNullableWorkspace().sId,
      trigger.toJSON(),
      contentFragment,
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  return new Ok(undefined);
}

function makeAgentTriggerWorkflowId(
  userId: string,
  workspaceId: string,
  trigger: TriggerType
): string {
  return `agent-trigger-${trigger.kind}-${userId}-${workspaceId}-${trigger.id}-${randomUUID()}`;
}
