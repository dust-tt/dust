import type { Authenticator } from "@app/lib/auth";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/triggers/config";
import { buildCronScheduleSpec } from "@app/temporal/triggers/schedule_client";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { ScheduleOptions } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { wakeUpWorkflow } from "./workflows";

export function makeWakeUpWorkflowId({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): string {
  return `wakeup-${workspaceId}-${wakeUpId}`;
}

export function makeWakeUpScheduleId({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): string {
  return `wakeup-schedule-${workspaceId}-${wakeUpId}`;
}

export async function launchOrScheduleWakeUpTemporalWorkflow(
  auth: Authenticator,
  { wakeUp }: { wakeUp: WakeUpType }
): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const owner = auth.getNonNullableWorkspace();
  const workflowId = makeWakeUpWorkflowId({
    workspaceId: owner.sId,
    wakeUpId: wakeUp.sId,
  });

  switch (wakeUp.scheduleConfig.type) {
    case "one_shot": {
      const startDelayMs = Math.max(
        0,
        wakeUp.scheduleConfig.fireAt - Date.now()
      );

      try {
        await client.workflow.start(wakeUpWorkflow, {
          args: [{ workspaceId: owner.sId, wakeUpId: wakeUp.sId }],
          taskQueue: QUEUE_NAME,
          workflowId,
          startDelay: startDelayMs,
          memo: {
            workspaceId: owner.sId,
            wakeUpId: wakeUp.sId,
          },
        });
      } catch (error) {
        // We log and error even if this is a WorkflowExecutionAlreadyStartedError, because it means
        // that the existing workflow is still running, which is unexpected (since this is a
        // one-shot wake-up).
        logger.error(
          {
            workspaceId: owner.sId,
            wakeUpId: wakeUp.sId,
            workflowId,
            error,
          },
          "Failed starting wake-up workflow."
        );

        return new Err(normalizeError(error));
      }

      return new Ok(undefined);
    }

    case "cron": {
      const scheduleId = makeWakeUpScheduleId({
        workspaceId: owner.sId,
        wakeUpId: wakeUp.sId,
      });

      const childLogger = logger.child({
        workspaceId: owner.sId,
        wakeUpId: wakeUp.sId,
        scheduleId,
        wakeUp,
      });

      const scheduleOptions: ScheduleOptions = {
        action: {
          type: "startWorkflow" as const,
          workflowType: wakeUpWorkflow,
          args: [{ workspaceId: owner.sId, wakeUpId: wakeUp.sId }] as const,
          taskQueue: QUEUE_NAME,
        },
        scheduleId,
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
        },
        spec: buildCronScheduleSpec(wakeUp.scheduleConfig),
      };

      const existingSchedule = client.schedule.getHandle(scheduleId);
      try {
        await existingSchedule.update((previous) => {
          return {
            ...scheduleOptions,
            state: previous.state,
          };
        });

        childLogger.info("Updated existing wake-up schedule.");
        return new Ok(undefined);
      } catch (error) {
        if (!(error instanceof ScheduleNotFoundError)) {
          childLogger.error(
            { error },
            "Failed to update existing wake-up schedule."
          );
          return new Err(normalizeError(error));
        }
      }

      try {
        await client.schedule.create(scheduleOptions);
        childLogger.info("Created new wake-up schedule.");
        return new Ok(undefined);
      } catch (error) {
        childLogger.error({ error }, "Failed to create wake-up schedule.");
        return new Err(normalizeError(error));
      }
    }

    default:
      return assertNever(wakeUp.scheduleConfig);
  }
}

export async function cancelWakeUpTemporalWorkflow(
  auth: Authenticator,
  { wakeUp }: { wakeUp: WakeUpType }
): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const owner = auth.getNonNullableWorkspace();

  switch (wakeUp.scheduleConfig.type) {
    case "one_shot": {
      const workflowId = makeWakeUpWorkflowId({
        workspaceId: owner.sId,
        wakeUpId: wakeUp.sId,
      });

      try {
        await client.workflow.getHandle(workflowId).cancel();
      } catch (error) {
        if (!(error instanceof WorkflowNotFoundError)) {
          logger.warn(
            {
              workspaceId: owner.sId,
              wakeUpId: wakeUp.sId,
              workflowId,
              error,
            },
            "Failed cancelling wake-up workflow."
          );
          return new Err(normalizeError(error));
        }
      }

      return new Ok(undefined);
    }

    case "cron": {
      const scheduleId = makeWakeUpScheduleId({
        workspaceId: owner.sId,
        wakeUpId: wakeUp.sId,
      });

      try {
        await client.schedule.getHandle(scheduleId).delete();
      } catch (error) {
        if (!(error instanceof ScheduleNotFoundError)) {
          logger.warn(
            {
              workspaceId: owner.sId,
              wakeUpId: wakeUp.sId,
              scheduleId,
              error,
            },
            "Failed deleting wake-up schedule."
          );
          return new Err(normalizeError(error));
        }
      }

      return new Ok(undefined);
    }

    default:
      return assertNever(wakeUp.scheduleConfig);
  }
}
