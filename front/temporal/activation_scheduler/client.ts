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
// Manual one-off runs
// ---------------------------------------------------------------------------

export async function startActivationWorkspaceWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `${WORKSPACE_WORKFLOW_ID_PREFIX}${workspaceId}-manual-${Date.now()}`;

  await client.workflow.start(activationWorkspaceWorkflow, {
    args: [{ workspaceId }],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  logger.info(
    { workflowId, workspaceId },
    "[ActivationScheduler] Started workspace workflow."
  );
  return new Ok(workflowId);
}
