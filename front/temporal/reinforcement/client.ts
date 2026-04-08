import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { hasReinforcementEnabled } from "@app/lib/reinforced_agent/workspace_check";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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
import { reinforcedSkillsWorkspaceWorkflow } from "./workflows";

/**
 * Returns the UTC hour corresponding to midnight in the given timezone.
 */
function getMidnightUtcHour(timezone: string): number {
  const midnightInTz = moment.tz("00:00", "HH:mm", timezone);
  return midnightInTz.utc().hour();
}

function makeWorkspaceCronWorkflowId(workspaceId: string): string {
  return `reinforced-skills-workspace-${workspaceId}`;
}

/**
 * List workspace sIds that have the reinforced_agents feature flag.
 */
async function getFlaggedWorkspaceIds(): Promise<string[]> {
  const allWorkspaces = await WorkspaceResource.listAll();
  const flaggedIds: string[] = [];

  for (const workspace of allWorkspaces) {
    try {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      if (await hasReinforcementEnabled(auth)) {
        flaggedIds.push(workspace.sId);
      }
    } catch (e) {
      logger.error(
        { error: e, workspaceId: workspace.sId },
        "[ReinforcedSkills] Error checking feature flags for workspace."
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
    await client.workflow.start(reinforcedSkillsWorkspaceWorkflow, {
      args: [{ workspaceId, useBatchMode: true, skipDelay: false }],
      taskQueue: QUEUE_NAME,
      workflowId,
      cronSchedule: `0 ${utcHour} * * *`,
    });

    logger.info(
      { region, timezone, utcHour, workflowId, workspaceId },
      "[ReinforcedSkills] Launched workspace cron workflow."
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, workspaceId },
        "[ReinforcedSkills] Workspace cron workflow already running, skipping."
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
    const handle: WorkflowHandle<typeof reinforcedSkillsWorkspaceWorkflow> =
      client.workflow.getHandle(workflowId);
    await handle.terminate(stopReason);
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info(
        { workflowId, workspaceId },
        "[ReinforcedSkills] Workspace cron workflow not running, skipping."
      );
    } else {
      logger.error(
        { error: e, workflowId, workspaceId },
        "[ReinforcedSkills] Failed stopping workspace cron workflow."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Bulk operations (all flagged workspaces)
// ---------------------------------------------------------------------------

export async function launchAllReinforcedSkillsWorkspaceCrons(): Promise<
  Result<undefined, Error>
> {
  const workspaceIds = await getFlaggedWorkspaceIds();

  await concurrentExecutor(
    workspaceIds,
    (workspaceId) => launchReinforcementWorkspaceCron({ workspaceId }),
    { concurrency: 8 }
  );

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[ReinforcedSkills] Launched cron workflows for all flagged workspaces."
  );

  return new Ok(undefined);
}

export async function stopAllReinforcedSkillsWorkspaceCrons(): Promise<void> {
  const workspaceIds = await getFlaggedWorkspaceIds();

  await concurrentExecutor(
    workspaceIds,
    (workspaceId) =>
      stopReinforcementWorkspaceCron({
        workspaceId,
        stopReason: "Stopped all via CLI",
      }),
    { concurrency: 8 }
  );

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[ReinforcedSkills] Stopped cron workflows for all flagged workspaces."
  );
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
  const workflowId = `reinforced-skills-workspace-${workspaceId}-manual-${Date.now()}`;

  await client.workflow.start(reinforcedSkillsWorkspaceWorkflow, {
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
    "[ReinforcedSkills] Started workspace workflow."
  );
  return new Ok(workflowId);
}
