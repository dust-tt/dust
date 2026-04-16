import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { REINFORCEMENT_EXCLUDED_PLAN_CODES } from "@app/lib/plans/plan_codes";
import { hasReinforcementEnabled } from "@app/lib/reinforced_agent/workspace_check";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { WorkflowHandle } from "@temporalio/client";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";
import moment from "moment-timezone";
import { QUEUE_NAME } from "./config";
import {
  ensureReinforcementWorkspaceCronsWorkflow,
  reinforcementWorkspaceWorkflow,
} from "./workflows";

/**
 * Returns the UTC hour corresponding to midnight in the given timezone.
 */
function getMidnightUtcHour(timezone: string): number {
  const midnightInTz = moment.tz("00:00", "HH:mm", timezone);
  return midnightInTz.utc().hour();
}

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

      if (await hasReinforcementEnabled(auth)) {
        flaggedIds.push(workspace.sId);
      }
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

/**
 * Launch a cron-scheduled workflow for a single workspace.
 * The cron fires at regional midnight; the workflow itself spreads execution
 * over a 0-2 hour window using a deterministic delay.
 */
export async function launchReinforcementWorkspaceCron({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const utcHour = getMidnightUtcHour(timezone);
  const workflowId = makeWorkspaceCronWorkflowId(workspaceId);

  try {
    await client.workflow.start(reinforcementWorkspaceWorkflow, {
      args: [{ workspaceId, useBatchMode: true, skipDelay: false }],
      taskQueue: QUEUE_NAME,
      workflowId,
      cronSchedule: `0 ${utcHour} * * *`,
    });

    logger.info(
      { region, timezone, utcHour, workflowId, workspaceId },
      "[Reinforcement] Launched workspace cron workflow."
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, workspaceId },
        "[Reinforcement] Workspace cron workflow already running, skipping."
      );
    } else {
      throw e;
    }
  }

  return new Ok(undefined);
}

/**
 * Stop the cron-scheduled workflow for a single workspace.
 */
export async function stopReinforcementWorkspaceCron({
  workspaceId,
  stopReason,
}: {
  workspaceId: string;
  stopReason: string;
}) {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeWorkspaceCronWorkflowId(workspaceId);

  try {
    const handle: WorkflowHandle<typeof reinforcementWorkspaceWorkflow> =
      client.workflow.getHandle(workflowId);
    await handle.terminate(stopReason);
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info(
        { workflowId, workspaceId },
        "[Reinforcement] Workspace cron workflow not running, skipping."
      );
    } else {
      logger.error(
        { error: e, workflowId, workspaceId },
        "[Reinforcement] Failed stopping workspace cron workflow."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Ensure crons (start missing, stop extra)
// ---------------------------------------------------------------------------

export const ENSURE_CRONS_WORKFLOW_ID = `ensure-${WORKSPACE_WORKFLOW_ID_PREFIX}crons`;

/**
 * Ensure all flagged workspaces have a running cron and stop crons for
 * workspaces that are no longer flagged.
 */
export async function ensureReinforcementWorkspaceCrons(): Promise<{
  started: string[];
  stopped: string[];
}> {
  const client = await getTemporalClientForFrontNamespace();
  const flaggedWorkspaceIds = new Set(await getReinforcementWorkspaceIds());

  // Find currently running cron workflows by workflow type.
  const runningWorkspaceIds = new Set<string>();
  for await (const workflow of client.workflow.list({
    query: `WorkflowType = "reinforcementWorkspaceWorkflow" AND ExecutionStatus = 'Running'`,
  })) {
    runningWorkspaceIds.add(
      workflow.workflowId.slice(WORKSPACE_WORKFLOW_ID_PREFIX.length)
    );
  }

  // Start crons for flagged workspaces that aren't running.
  const started: string[] = [];
  for (const workspaceId of flaggedWorkspaceIds) {
    if (!runningWorkspaceIds.has(workspaceId)) {
      await launchReinforcementWorkspaceCron({ workspaceId });
      started.push(workspaceId);
    }
  }

  // Stop crons for workspaces that are running but no longer flagged.
  const stopped: string[] = [];
  for (const workspaceId of runningWorkspaceIds) {
    if (!flaggedWorkspaceIds.has(workspaceId)) {
      await stopReinforcementWorkspaceCron({
        workspaceId,
        stopReason: "Workspace no longer flagged for reinforcement",
      });
      stopped.push(workspaceId);
    }
  }

  logger.info(
    { startedCount: started.length, stoppedCount: stopped.length },
    "[Reinforcement] Ensured reinforcement workspace crons."
  );

  return { started, stopped };
}

// ---------------------------------------------------------------------------
// Bulk stop (all flagged workspaces)
// ---------------------------------------------------------------------------

export async function stopAllReinforcementWorkspaceCrons(): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();

  // Stop all running reinforcement workspace cron workflows.
  const runningWorkspaceIds: string[] = [];
  for await (const workflow of client.workflow.list({
    query: `WorkflowType = "reinforcementWorkspaceWorkflow" AND ExecutionStatus = 'Running'`,
  })) {
    runningWorkspaceIds.push(
      workflow.workflowId.slice(WORKSPACE_WORKFLOW_ID_PREFIX.length)
    );
  }

  for (const workspaceId of runningWorkspaceIds) {
    await stopReinforcementWorkspaceCron({
      workspaceId,
      stopReason: "Stopped all via CLI",
    });
  }

  logger.info(
    { workspaceCount: runningWorkspaceIds.length },
    "[Reinforcement] Stopped cron workflows for all workspaces."
  );
}

export async function launchEnsureReinforcementCronsWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const elevenPmInTz = moment.tz("23:00", "HH:mm", timezone);
  const utcHour = elevenPmInTz.utc().hour();

  try {
    await client.workflow.start(ensureReinforcementWorkspaceCronsWorkflow, {
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
        skipDelay: true,
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
