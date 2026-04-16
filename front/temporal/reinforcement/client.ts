import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { REINFORCEMENT_EXCLUDED_PLAN_CODES } from "@app/lib/plans/plan_codes";
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
import moment from "moment-timezone";
import { QUEUE_NAME } from "./config";
import {
  ensureReinforcementWorkspaceSchedulesWorkflow,
  reinforcementWorkspaceWorkflow,
} from "./workflows";

const WORKSPACE_WORKFLOW_ID_PREFIX = "reinforcement-workspace-";

export function makeWorkspaceCronWorkflowId(workspaceId: string): string {
  return `${WORKSPACE_WORKFLOW_ID_PREFIX}${workspaceId}`;
}

/**
 * List workspace sIds that have the reinforced_agents feature flag,
 * excluding workspaces on free upgraded or free trial phone plans.
 */
async function getReinforcementWorkspaceIds(): Promise<string[]> {
  const allWorkspaces = await WorkspaceResource.listAll();
  const flaggedIds: string[] = [];

  for (const workspace of allWorkspaces) {
    try {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const planCode = auth.plan()?.code;
      if (planCode && REINFORCEMENT_EXCLUDED_PLAN_CODES.has(planCode)) {
        continue;
      }

      flaggedIds.push(workspace.sId);
    } catch (e) {
      logger.error(
        { error: e, workspaceId: workspace.sId },
        "[Reinforcement] Error checking feature flags for workspace."
      );
    }
  }

  return flaggedIds;
}

// ---------------------------------------------------------------------------
// Per-workspace cron lifecycle
// ---------------------------------------------------------------------------

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

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
  const scheduleId = makeWorkspaceCronWorkflowId(workspaceId);

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
        calendars: [{ hour: 0, minute: 0 }],
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
  const scheduleId = makeWorkspaceCronWorkflowId(workspaceId);

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
// Ensure crons (start missing, stop extra)
// ---------------------------------------------------------------------------

export const ENSURE_CRONS_WORKFLOW_ID = `ensure-${WORKSPACE_WORKFLOW_ID_PREFIX}crons`;

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

  // Find existing schedules by ID prefix.
  const runningWorkspaceIds = new Set<string>();
  for await (const schedule of client.schedule.list()) {
    if (schedule.scheduleId.startsWith(WORKSPACE_WORKFLOW_ID_PREFIX)) {
      runningWorkspaceIds.add(
        schedule.scheduleId.slice(WORKSPACE_WORKFLOW_ID_PREFIX.length)
      );
    }
  }

  // Workspaces that need a schedule started / stopped.
  const toStart = [...reinforcedWorkspaceIds].filter(
    (id) => !runningWorkspaceIds.has(id)
  );
  const toStop = [...runningWorkspaceIds].filter(
    (id) => !reinforcedWorkspaceIds.has(id)
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

  logger.info(
    { startedCount: started.length, stoppedCount: stopped.length },
    "[Reinforcement] Ensured reinforcement workspace schedules."
  );

  return { started, stopped };
}

// ---------------------------------------------------------------------------
// Bulk stop (all flagged workspaces)
// ---------------------------------------------------------------------------

export async function stopAllReinforcementWorkspaceCrons(): Promise<void> {
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
  const elevenPmInTz = moment.tz("23:00", "HH:mm", timezone);
  const utcHour = elevenPmInTz.utc().hour();

  try {
    await client.workflow.start(ensureReinforcementWorkspaceSchedulesWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: ENSURE_CRONS_WORKFLOW_ID,
      cronSchedule: `0 ${utcHour} * * *`,
    });

    logger.info(
      { region, timezone, utcHour, workflowId: ENSURE_CRONS_WORKFLOW_ID },
      "[Reinforcement] Launched ensure-crons workflow."
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId: ENSURE_CRONS_WORKFLOW_ID },
        "[Reinforcement] Ensure-crons workflow already running, skipping."
      );
    } else {
      throw e;
    }
  }

  return new Ok(ENSURE_CRONS_WORKFLOW_ID);
}

export async function stopEnsureReinforcementCronsWorkflow(): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle = client.workflow.getHandle(ENSURE_CRONS_WORKFLOW_ID);
    await handle.terminate("Stopped via CLI");
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info(
        { workflowId: ENSURE_CRONS_WORKFLOW_ID },
        "[Reinforcement] Ensure-crons workflow not running, skipping."
      );
    } else {
      logger.error(
        { error: e, workflowId: ENSURE_CRONS_WORKFLOW_ID },
        "[Reinforcement] Failed stopping ensure-crons workflow."
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
