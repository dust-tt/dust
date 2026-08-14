import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { QUEUE_NAME } from "@app/temporal/triggers/config";
import { gmailMessagesMonitorWorkflow } from "@app/temporal/triggers/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

export function makeGmailMonitorScheduleId(
  workspaceId: string,
  triggerId: string
): string {
  return `gmail-monitor-${workspaceId}-${triggerId}`;
}

export async function createOrUpdateGmailMonitorSchedule({
  auth,
  trigger,
}: {
  auth: Authenticator;
  trigger: TriggerResource;
}): Promise<Result<string, Error>> {
  const monitorTrigger = trigger.toJSON();
  if (monitorTrigger.kind !== "monitor") {
    return new Err(new Error("Trigger is not a monitor"));
  }
  if (auth.getNonNullableUser().id !== trigger.editor) {
    return new Ok("");
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const scheduleId = makeGmailMonitorScheduleId(workspaceId, trigger.sId);
  const options = {
    action: {
      type: "startWorkflow" as const,
      workflowType: gmailMessagesMonitorWorkflow,
      args: [
        {
          userId: auth.getNonNullableUser().sId,
          workspaceId,
          triggerId: trigger.sId,
        },
      ] as const,
      taskQueue: QUEUE_NAME,
    },
    scheduleId,
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
    spec: {
      intervals: [
        { every: monitorTrigger.configuration.intervalMinutes * 60 * 1000 },
      ],
    },
  };
  const client = await getTemporalClientForAgentNamespace();
  const handle = client.schedule.getHandle(scheduleId);
  try {
    await handle.update((previous) => ({ ...options, state: previous.state }));
    return new Ok(scheduleId);
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      return new Err(normalizeError(error));
    }
  }
  try {
    await client.schedule.create(options);
    return new Ok(scheduleId);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function deleteGmailMonitorSchedule({
  workspaceId,
  trigger,
}: {
  workspaceId: string;
  trigger: TriggerResource;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  try {
    await client.schedule
      .getHandle(makeGmailMonitorScheduleId(workspaceId, trigger.sId))
      .delete();
    return new Ok(undefined);
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return new Ok(undefined);
    }
    return new Err(normalizeError(error));
  }
}
