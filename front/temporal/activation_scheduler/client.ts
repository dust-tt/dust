import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { QUEUE_NAME } from "./config";
import { runActivationSignal } from "./signals";
import { activationWorkspaceWorkflow } from "./workflows";

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
