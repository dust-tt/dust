import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ActivationWorkspaceWorkflowArgs } from "@app/temporal/activation_scheduler/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";
import moment from "moment-timezone";

import { QUEUE_NAME } from "./config";
import { runActivationSignal } from "./signals";
import {
  activationWorkspaceWorkflow,
  ensureActivationWorkspaceSchedulesWorkflow,
} from "./workflows";

const WORKSPACE_WORKFLOW_ID_PREFIX = "activation-workspace-";

export function makeWorkspaceWorkflowId(workspaceId: string): string {
  return `${WORKSPACE_WORKFLOW_ID_PREFIX}${workspaceId}`;
}

// ---------------------------------------------------------------------------
// Per-workspace cron lifecycle
// ---------------------------------------------------------------------------

const ACTIVATION_WORKDAY_START_HOUR = 9;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Launch a schedule for a single workspace.
 * Fires at the start of the regional workday with a 1-hour jitter to spread
 * load.
 */
export async function startActivationWorkspaceSchedule({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  if (auth.plan()?.isByok) {
    logger.info(
      { workspaceId },
      "[ActivationScheduler] Skipping schedule for BYOK workspace."
    );
    return new Ok(undefined);
  }

  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const scheduleId = makeWorkspaceWorkflowId(workspaceId);

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: activationWorkspaceWorkflow,
        args: [{ workspaceId }],
        taskQueue: QUEUE_NAME,
        // Pinned to the same deterministic id used by the on-demand
        // signalWithStart trigger below, so a poke/admin-forced cycle joins
        // the day's scheduled run instead of starting a second one.
        workflowId: scheduleId,
      },
      scheduleId,
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        calendars: [{ hour: ACTIVATION_WORKDAY_START_HOUR, minute: 0 }],
        timezone,
        jitter: ONE_HOUR_MS,
      },
    });

    logger.info(
      { region, timezone, scheduleId, workspaceId },
      "[ActivationScheduler] Created workspace schedule."
    );
  } catch (e) {
    if (e instanceof ScheduleAlreadyRunning) {
      logger.info(
        { scheduleId, workspaceId },
        "[ActivationScheduler] Workspace schedule already exists, skipping."
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
export async function deleteActivationWorkspaceSchedule({
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
        "[ActivationScheduler] Workspace schedule not found, skipping."
      );
    } else {
      logger.error(
        { error: e, scheduleId, workspaceId },
        "[ActivationScheduler] Failed deleting workspace schedule."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// On-demand runs (poke/admin-forced cycles)
// ---------------------------------------------------------------------------

/**
 * Triggers an activation cycle for a workspace on demand, through the same
 * code path as the scheduled run: `signalWithStart` against the workspace's
 * deterministic workflow id starts a fresh run if none is active today, or
 * simply signals the one already in flight (started by the schedule) if one
 * is running.
 */
export async function triggerActivationWorkspaceWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeWorkspaceWorkflowId(workspaceId);

  await client.workflow.signalWithStart(activationWorkspaceWorkflow, {
    args: [{ workspaceId }],
    taskQueue: QUEUE_NAME,
    workflowId,
    signal: runActivationSignal,
    signalArgs: undefined,
  });

  logger.info(
    { workflowId, workspaceId },
    "[ActivationScheduler] Triggered workspace workflow."
  );
  return new Ok(workflowId);
}

/**
 * One-off poke/admin run against the same workflow function as the daily
 * schedule, but a distinct workflow id so it cannot no-op against an in-flight
 * workday run. `overrideChecks` skips cadence, activation-status, BYOK, and
 * the per-run user cap; membership and credit still apply.
 */
export async function startActivationWorkspaceWorkflow(
  args: ActivationWorkspaceWorkflowArgs
): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `${makeWorkspaceWorkflowId(args.workspaceId)}-manual-${Date.now()}`;

  try {
    await client.workflow.start(activationWorkspaceWorkflow, {
      args: [args],
      taskQueue: QUEUE_NAME,
      workflowId,
    });
  } catch (e) {
    logger.error(
      { workflowId, workspaceId: args.workspaceId, error: e },
      "[ActivationScheduler] Failed starting on-demand workspace workflow."
    );
    return new Err(normalizeError(e));
  }

  logger.info(
    { workflowId, workspaceId: args.workspaceId },
    "[ActivationScheduler] Started on-demand workspace workflow."
  );
  return new Ok(workflowId);
}

// ---------------------------------------------------------------------------
// Ensure schedules (start missing, stop extra)
// ---------------------------------------------------------------------------

/**
 * Workspaces that currently have at least one live Activation Pod, i.e. the
 * workspaces that should have a running schedule. Provisioning a workspace's
 * first pod (see the `join-activation-pod` poke plugin) defines scope going
 * forward; this reconcile pass is the safety net that keeps schedules in
 * sync as pods are provisioned/removed outside that hook.
 */
async function getActivationWorkspaceIds(): Promise<string[]> {
  const workspaceModelIds =
    await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();
  if (workspaceModelIds.length === 0) {
    return [];
  }

  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceModelIds);
  return workspaces.map((workspace) => workspace.sId);
}

/**
 * Ensure every workspace with a live Activation Pod has a running schedule,
 * and delete schedules for workspaces that no longer have any pod left. This
 * is the only place schedules are deleted for that reason; a stale schedule
 * firing for an emptied-out workspace is a no-op (the workflow enumerates
 * zero eligible pods).
 */
export async function ensureActivationWorkspaceSchedules(): Promise<{
  started: string[];
  stopped: string[];
}> {
  const client = await getTemporalClientForFrontNamespace();
  const inScopeWorkspaceIds = new Set(await getActivationWorkspaceIds());
  logger.info(
    { inScopeWorkspaceCount: inScopeWorkspaceIds.size },
    "[ActivationScheduler] Ensuring workspace schedules."
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
    "[ActivationScheduler] Found existing workspace schedules."
  );

  // Workspaces that need a schedule started / stopped.
  const toStart = [...inScopeWorkspaceIds].filter(
    (id) => !runningWorkspaceIds.has(id)
  );
  const toStop = [...runningWorkspaceIds].filter(
    (id) => !inScopeWorkspaceIds.has(id)
  );
  logger.info(
    { toStartCount: toStart.length, toStopCount: toStop.length },
    "[ActivationScheduler] Schedules to start/stop."
  );

  const CONCURRENCY = 5;

  // Create schedules for in-scope workspaces that don't have one.
  const started = await concurrentExecutor(
    toStart,
    async (workspaceId) => {
      logger.info(
        { workspaceId },
        "[ActivationScheduler] Creating schedule for workspace."
      );
      await startActivationWorkspaceSchedule({ workspaceId });
      return workspaceId;
    },
    { concurrency: CONCURRENCY }
  );

  // Delete schedules for workspaces that no longer have a live pod.
  const stopped = await concurrentExecutor(
    toStop,
    async (workspaceId) => {
      logger.info(
        { workspaceId },
        "[ActivationScheduler] Deleting schedule for workspace."
      );
      await deleteActivationWorkspaceSchedule({ workspaceId });
      return workspaceId;
    },
    { concurrency: CONCURRENCY }
  );

  logger.info(
    { startedCount: started.length, stoppedCount: stopped.length },
    "[ActivationScheduler] Ensured activation workspace schedules."
  );

  return { started, stopped };
}

// ---------------------------------------------------------------------------
// Bulk stop (all workspaces)
// ---------------------------------------------------------------------------

export async function stopAllActivationWorkspaceSchedules(): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();

  const workspaceIds: string[] = [];
  for await (const schedule of client.schedule.list()) {
    if (schedule.scheduleId.startsWith(WORKSPACE_WORKFLOW_ID_PREFIX)) {
      workspaceIds.push(
        schedule.scheduleId.slice(WORKSPACE_WORKFLOW_ID_PREFIX.length)
      );
    }
  }

  for (const workspaceId of workspaceIds) {
    await deleteActivationWorkspaceSchedule({ workspaceId });
  }

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[ActivationScheduler] Deleted schedules for all workspaces."
  );
}

// ---------------------------------------------------------------------------
// Nightly reconcile cron
// ---------------------------------------------------------------------------

const ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID = `ensure-${WORKSPACE_WORKFLOW_ID_PREFIX}schedules`;

const ELEVEN_PM = "23:00";

export async function launchEnsureActivationSchedulesWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const elevenPmInTz = moment.tz(ELEVEN_PM, "HH:mm", timezone);
  const utcHour = elevenPmInTz.utc().hour();

  try {
    await client.workflow.start(ensureActivationWorkspaceSchedulesWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID,
      cronSchedule: `0 ${utcHour} * * *`,
    });

    logger.info(
      {
        region,
        timezone,
        utcHour,
        workflowId: ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID,
      },
      "[ActivationScheduler] Launched ensure-schedules workflow."
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId: ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID },
        "[ActivationScheduler] Ensure-schedules workflow already running, skipping."
      );
    } else {
      throw e;
    }
  }

  return new Ok(ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID);
}

export async function stopEnsureActivationSchedulesWorkflow(): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle = client.workflow.getHandle(
      ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID
    );
    await handle.terminate("Stopped via CLI");
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info(
        { workflowId: ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID },
        "[ActivationScheduler] Ensure-schedules workflow not running, skipping."
      );
    } else {
      logger.error(
        { error: e, workflowId: ENSURE_ACTIVATION_SCHEDULES_WORKFLOW_ID },
        "[ActivationScheduler] Failed stopping ensure-schedules workflow."
      );
    }
  }
}
