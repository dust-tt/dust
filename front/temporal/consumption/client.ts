import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/consumption/config";
import { consumptionEventsAppendedSignal } from "@app/temporal/consumption/signals";
import { makeConsumptionWorkflowId } from "@app/temporal/consumption/workflow_ids";
import {
  cleanupConsumptionEventsWorkflow,
  consumptionWorkflow,
  recoverPendingConsumptionWorkflowsWorkflow,
} from "@app/temporal/consumption/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

const CONSUMPTION_EVENTS_CLEANUP_SCHEDULE_ID =
  "consumption-events-cleanup-schedule";
const CONSUMPTION_EVENTS_RECOVERY_SCHEDULE_ID =
  "consumption-events-recovery-schedule";

async function createOrUpdateConsumptionSchedule({
  cronExpressions,
  name,
  scheduleId,
  workflowType,
}: {
  cronExpressions: string[];
  name: string;
  scheduleId: string;
  workflowType:
    | typeof cleanupConsumptionEventsWorkflow
    | typeof recoverPendingConsumptionWorkflowsWorkflow;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleOptions = {
    action: {
      type: "startWorkflow" as const,
      workflowType,
      args: [],
      taskQueue: QUEUE_NAME,
    },
    scheduleId,
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
    spec: {
      cronExpressions,
      timezone: "UTC",
    },
  } as const;

  const schedule = client.schedule.getHandle(scheduleId);
  try {
    await schedule.update((previous) => ({
      ...scheduleOptions,
      state: previous.state,
    }));
    logger.info(
      { scheduleId, scheduleName: name },
      "[Consumption] Updated consumption schedule."
    );
    return new Ok(undefined);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      logger.error(
        { err: normalizeError(err), scheduleId, scheduleName: name },
        "[Consumption] Failed to update consumption schedule."
      );
      return new Err(normalizeError(err));
    }
  }

  try {
    await client.schedule.create(scheduleOptions);
    logger.info(
      { scheduleId, scheduleName: name },
      "[Consumption] Created consumption schedule."
    );
    return new Ok(undefined);
  } catch (err) {
    logger.error(
      { err: normalizeError(err), scheduleId, scheduleName: name },
      "[Consumption] Failed to create consumption schedule."
    );
    return new Err(normalizeError(err));
  }
}

export async function createOrUpdateConsumptionEventsCleanupSchedule(): Promise<
  Result<void, Error>
> {
  return createOrUpdateConsumptionSchedule({
    cronExpressions: ["0 3 * * *"],
    name: "outbox cleanup",
    scheduleId: CONSUMPTION_EVENTS_CLEANUP_SCHEDULE_ID,
    workflowType: cleanupConsumptionEventsWorkflow,
  });
}

export async function createOrUpdateConsumptionEventsRecoverySchedule(): Promise<
  Result<void, Error>
> {
  return createOrUpdateConsumptionSchedule({
    cronExpressions: ["* * * * *"],
    name: "outbox recovery",
    scheduleId: CONSUMPTION_EVENTS_RECOVERY_SCHEDULE_ID,
    workflowType: recoverPendingConsumptionWorkflowsWorkflow,
  });
}

export async function signalConsumptionEventsAppended(
  authType: AuthenticatorType,
  { runKey }: { runKey: string }
): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const workflowId = makeConsumptionWorkflowId({ workspaceId, runKey });

  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.signalWithStart(consumptionWorkflow, {
      args: [authType, { runKey }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: consumptionEventsAppendedSignal,
      signalArgs: undefined,
      searchAttributes: {
        workspaceId: [workspaceId],
      },
      memo: {
        runKey,
        workspaceId,
      },
    });

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      { workflowId, workspaceId, runKey, err: normalizeError(err) },
      "[Consumption] Failed to signal the consumption workflow."
    );

    return new Err(normalizeError(err));
  }
}
