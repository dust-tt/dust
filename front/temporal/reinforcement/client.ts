import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { localTimeOfDayToUtc } from "@app/lib/api/timezone";
import { REINFORCEMENT_EXCLUDED_PLAN_CODES } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";
import { QUEUE_NAME } from "./config";
import {
  ensureReinforcementWorkspaceSchedulesWorkflow,
  reinforcementWorkspaceWorkflow,
} from "./workflows";

const WORKSPACE_WORKFLOW_ID_PREFIX = "reinforcement-workspace-";

export function makeWorkspaceWorkflowId(workspaceId: string): string {
  return `${WORKSPACE_WORKFLOW_ID_PREFIX}${workspaceId}`;
}

const WORKSPACE_LIST_BATCH_SIZE = 1000;

/**
 * List workspace sIds with an active subscription,
 * excluding workspaces on free upgraded or free trial phone plans.
 */
async function getReinforcementWorkspaceIds(): Promise<string[]> {
  const reinforcementWorkspaceIds: string[] = [];
  let lastWorkspaceModelId = 0;

  while (true) {
    const batch =
      await WorkspaceResource.unsafeListWorkspaceIdBatchAfterModelId({
        lastWorkspaceModelId,
        limit: WORKSPACE_LIST_BATCH_SIZE,
      });
    if (batch.length === 0) {
      break;
    }
    lastWorkspaceModelId = batch[batch.length - 1].workspaceModelId;

    const subscriptionByWorkspaceModelId =
      await SubscriptionResource.fetchActiveByWorkspacesModelId(
        batch.map(({ workspaceModelId }) => workspaceModelId)
      );

    for (const { workspaceModelId, workspaceId } of batch) {
      // Every requested workspace has an entry: those without an active subscription get a
      // free-no-plan placeholder with status "ended", hence the status check.
      const subscription = subscriptionByWorkspaceModelId[workspaceModelId];
      if (
        subscription.status === "active" &&
        !REINFORCEMENT_EXCLUDED_PLAN_CODES.has(subscription.getPlan().code)
      ) {
        reinforcementWorkspaceIds.push(workspaceId);
      }
    }
  }

  return reinforcementWorkspaceIds;
}

// ---------------------------------------------------------------------------
// Per-workspace cron lifecycle
// ---------------------------------------------------------------------------

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ACTIVATION_WORKDAY_START_HOUR = 3;

/**
 * Launch a schedule for a single workspace.
 * Fires at regional midnight with a 2-hour jitter to spread load.
 */
export async function startReinforcementWorkspaceSchedule({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const scheduleId = makeWorkspaceWorkflowId(workspaceId);

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: reinforcementWorkspaceWorkflow,
        args: [{ workspaceId, useBatchMode: true }],
        taskQueue: QUEUE_NAME,
      },
      scheduleId,
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        calendars: [{ hour: ACTIVATION_WORKDAY_START_HOUR, minute: 0 }],
        timezone,
        jitter: TWO_HOURS_MS,
      },
    });

    logger.info(
      { region, timezone, scheduleId, workspaceId },
      "[Reinforcement] Created workspace schedule."
    );
  } catch (e) {
    if (e instanceof ScheduleAlreadyRunning) {
      logger.info(
        { scheduleId, workspaceId },
        "[Reinforcement] Workspace schedule already exists, skipping."
      );
    } else {
      throw e;
    }
  }

  return new Ok(undefined);
}

/**
 * Stop (delete) the schedule for a single workspace.
 */
export async function deleteReinforcementWorkspaceSchedule({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = makeWorkspaceWorkflowId(workspaceId);

  try {
    const handle = client.schedule.getHandle(scheduleId);
    await handle.delete();
  } catch (e) {
    if (e instanceof ScheduleNotFoundError) {
      logger.info(
        { scheduleId, workspaceId },
        "[Reinforcement] Workspace schedule not found, skipping."
      );
    } else {
      logger.error(
        { error: e, scheduleId, workspaceId },
        "[Reinforcement] Failed deleting workspace schedule."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Ensure schedules (start missing, stop extra)
// ---------------------------------------------------------------------------

export const ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID = `ensure-${WORKSPACE_WORKFLOW_ID_PREFIX}schedules`;

/**
 * Ensure all flagged workspaces have a running schedule and delete schedules
 * for workspaces that are no longer flagged.
 */
export async function ensureReinforcementWorkspaceSchedules(): Promise<{
  started: string[];
  stopped: string[];
}> {
  const client = await getTemporalClientForFrontNamespace();
  const reinforcedWorkspaceIds = new Set(await getReinforcementWorkspaceIds());
  logger.info(
    { reinforcedWorkspaceCount: reinforcedWorkspaceIds.size },
    "[Reinforcement] Ensuring workspace schedules."
  );

  // Find existing schedules by ID prefix.
  const runningWorkspaceIds = new Set<string>();
  for await (const schedule of client.schedule.list()) {
    if (schedule.scheduleId.startsWith(WORKSPACE_WORKFLOW_ID_PREFIX)) {
      runningWorkspaceIds.add(
        schedule.scheduleId.slice(WORKSPACE_WORKFLOW_ID_PREFIX.length)
      );
    }
  }
  logger.info(
    { runningWorkspaceCount: runningWorkspaceIds.size },
    "[Reinforcement] Found existing workspace schedules."
  );

  // Workspaces that need a schedule started / stopped.
  const toStart = [...reinforcedWorkspaceIds].filter(
    (id) => !runningWorkspaceIds.has(id)
  );
  const toStop = [...runningWorkspaceIds].filter(
    (id) => !reinforcedWorkspaceIds.has(id)
  );
  logger.info(
    { toStartCount: toStart.length, toStopCount: toStop.length },
    "[Reinforcement] Schedules to start/stop."
  );

  const CONCURRENCY = 5;

  // Create schedules for flagged workspaces that don't have one.
  const started = await concurrentExecutor(
    toStart,
    async (workspaceId) => {
      logger.info(
        { workspaceId },
        "[Reinforcement] Creating schedule for workspace."
      );
      await startReinforcementWorkspaceSchedule({ workspaceId });
      return workspaceId;
    },
    { concurrency: CONCURRENCY }
  );

  // Delete schedules for workspaces that are no longer flagged.
  const stopped = await concurrentExecutor(
    toStop,
    async (workspaceId) => {
      logger.info(
        { workspaceId },
        "[Reinforcement] Deleting schedule for workspace."
      );
      await deleteReinforcementWorkspaceSchedule({ workspaceId });
      return workspaceId;
    },
    { concurrency: CONCURRENCY }
  );

  // Migrate existing schedules that point at an outdated task queue: the task
  // queue is baked into the schedule action at creation time, so a
  // QUEUE_VERSION bump would otherwise strand them on the old queue forever.
  const toCheck = [...runningWorkspaceIds].filter((id) =>
    reinforcedWorkspaceIds.has(id)
  );
  const updated = await concurrentExecutor(
    toCheck,
    async (workspaceId) => {
      const handle = client.schedule.getHandle(
        makeWorkspaceWorkflowId(workspaceId)
      );
      const description = await handle.describe();
      if (
        description.action.type !== "startWorkflow" ||
        description.action.taskQueue === QUEUE_NAME
      ) {
        return null;
      }
      logger.info(
        { workspaceId, previousTaskQueue: description.action.taskQueue },
        "[Reinforcement] Updating schedule to current task queue."
      );
      await handle.update((previous) => ({
        ...previous,
        action: {
          ...previous.action,
          taskQueue: QUEUE_NAME,
        },
      }));
      return workspaceId;
    },
    { concurrency: CONCURRENCY }
  );
  const updatedCount = updated.filter((id) => id !== null).length;

  logger.info(
    {
      startedCount: started.length,
      stoppedCount: stopped.length,
      updatedCount,
    },
    "[Reinforcement] Ensured reinforcement workspace schedules."
  );

  return { started, stopped };
}

// ---------------------------------------------------------------------------
// Bulk stop (all flagged workspaces)
// ---------------------------------------------------------------------------

export async function stopAllReinforcementWorkspaceSchedules(): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();

  // Delete all reinforcement workspace schedules.
  const workspaceIds: string[] = [];
  for await (const schedule of client.schedule.list()) {
    if (schedule.scheduleId.startsWith(WORKSPACE_WORKFLOW_ID_PREFIX)) {
      workspaceIds.push(
        schedule.scheduleId.slice(WORKSPACE_WORKFLOW_ID_PREFIX.length)
      );
    }
  }

  for (const workspaceId of workspaceIds) {
    await deleteReinforcementWorkspaceSchedule({ workspaceId });
  }

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[Reinforcement] Deleted schedules for all workspaces."
  );
}

export async function launchEnsureReinforcementSchedulesWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const { hour: utcHour } = localTimeOfDayToUtc(23, 0, timezone);

  try {
    await client.workflow.start(ensureReinforcementWorkspaceSchedulesWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID,
      cronSchedule: `0 ${utcHour} * * *`,
    });

    logger.info(
      {
        region,
        timezone,
        utcHour,
        workflowId: ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID,
      },
      "[Reinforcement] Launched ensure-schedules workflow."
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId: ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID },
        "[Reinforcement] Ensure-schedules workflow already running, skipping."
      );
    } else {
      throw e;
    }
  }

  return new Ok(ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID);
}

export async function stopEnsureReinforcementSchedulesWorkflow(): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle = client.workflow.getHandle(
      ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID
    );
    await handle.terminate("Stopped via CLI");
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info(
        { workflowId: ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID },
        "[Reinforcement] Ensure-schedules workflow not running, skipping."
      );
    } else {
      logger.error(
        { error: e, workflowId: ENSURE_REINFORCEMENT_SCHEDULES_WORKFLOW_ID },
        "[Reinforcement] Failed stopping ensure-schedules workflow."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Manual one-off runs
// ---------------------------------------------------------------------------

export async function startReinforcementWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
  skillId,
  conversationLookbackDays,
  disableNotifications,
}: {
  workspaceId: string;
  useBatchMode: boolean;
  skillId?: string;
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `${WORKSPACE_WORKFLOW_ID_PREFIX}${workspaceId}-manual-${Date.now()}`;

  await client.workflow.start(reinforcementWorkspaceWorkflow, {
    args: [
      {
        workspaceId,
        useBatchMode,
        skillId,
        conversationLookbackDays,
        disableNotifications,
      },
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  logger.info(
    { workflowId, workspaceId, skillId },
    "[Reinforcement] Started workspace workflow."
  );
  return new Ok(workflowId);
}
