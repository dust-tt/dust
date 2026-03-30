import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
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
import {
  reinforcedAgentForAgentWorkflow,
  reinforcedAgentWorkspaceWorkflow,
} from "./workflows";

/**
 * Returns the UTC hour corresponding to midnight in the given timezone.
 */
function getMidnightUtcHour(timezone: string): number {
  const midnightInTz = moment.tz("00:00", "HH:mm", timezone);
  return midnightInTz.utc().hour();
}

function makeWorkspaceCronWorkflowId(workspaceId: string): string {
  return `reinforced-agent-workspace-${workspaceId}`;
}

/**
 * List workspace sIds that have the reinforced_agents feature flag.
 */
async function getFlaggedWorkspaceIds(): Promise<string[]> {
  const allWorkspaces = await WorkspaceResource.listAll();
  const flaggedIds: string[] = [];

  for (const workspace of allWorkspaces) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const featureFlags = await getFeatureFlags(auth);
    if (featureFlags.includes("reinforced_agents")) {
      flaggedIds.push(workspace.sId);
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
 * over a 0–2 hour window using a deterministic delay.
 */
export async function launchReinforcedAgentWorkspaceCron({
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
    await client.workflow.start(reinforcedAgentWorkspaceWorkflow, {
      args: [{ workspaceId, useBatchMode: true, skipDelay: false }],
      taskQueue: QUEUE_NAME,
      workflowId,
      cronSchedule: `0 ${utcHour} * * *`,
    });

    logger.info(
      { region, timezone, utcHour, workflowId, workspaceId },
      "[ReinforcedAgent] Launched workspace cron workflow."
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, workspaceId },
        "[ReinforcedAgent] Workspace cron workflow already running, skipping."
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
export async function stopReinforcedAgentWorkspaceCron({
  workspaceId,
  stopReason,
}: {
  workspaceId: string;
  stopReason: string;
}) {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeWorkspaceCronWorkflowId(workspaceId);

  try {
    const handle: WorkflowHandle<typeof reinforcedAgentWorkspaceWorkflow> =
      client.workflow.getHandle(workflowId);
    await handle.terminate(stopReason);
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info(
        { workflowId, workspaceId },
        "[ReinforcedAgent] Workspace cron workflow not running, skipping."
      );
    } else {
      logger.error(
        { error: e, workflowId, workspaceId },
        "[ReinforcedAgent] Failed stopping workspace cron workflow."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Bulk operations (all flagged workspaces)
// ---------------------------------------------------------------------------

export async function launchAllReinforcedAgentWorkspaceCrons(): Promise<
  Result<undefined, Error>
> {
  const workspaceIds = await getFlaggedWorkspaceIds();

  await concurrentExecutor(
    workspaceIds,
    (workspaceId) => launchReinforcedAgentWorkspaceCron({ workspaceId }),
    { concurrency: 8 }
  );

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[ReinforcedAgent] Launched cron workflows for all flagged workspaces."
  );

  return new Ok(undefined);
}

export async function stopAllReinforcedAgentWorkspaceCrons(): Promise<void> {
  const workspaceIds = await getFlaggedWorkspaceIds();

  await concurrentExecutor(
    workspaceIds,
    (workspaceId) =>
      stopReinforcedAgentWorkspaceCron({
        workspaceId,
        stopReason: "Stopped all via CLI",
      }),
    { concurrency: 8 }
  );

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[ReinforcedAgent] Stopped cron workflows for all flagged workspaces."
  );
}

// ---------------------------------------------------------------------------
// Manual one-off runs
// ---------------------------------------------------------------------------

export async function startReinforcedAgentWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
}: {
  workspaceId: string;
  useBatchMode: boolean;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `reinforced-agent-workspace-${workspaceId}-manual-${Date.now()}`;

  await client.workflow.start(reinforcedAgentWorkspaceWorkflow, {
    args: [{ workspaceId, useBatchMode, skipDelay: true }],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  logger.info(
    { workflowId, workspaceId },
    "[ReinforcedAgent] Started workspace workflow."
  );
  return new Ok(workflowId);
}

export async function startReinforcedAgentForAgentWorkflow({
  workspaceId,
  agentConfigurationId,
  useBatchMode,
  conversationLookbackDays = 1,
  disableNotifications,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  useBatchMode: boolean;
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `reinforced-agent-${workspaceId}-${agentConfigurationId}-manual-${Date.now()}`;

  await client.workflow.start(reinforcedAgentForAgentWorkflow, {
    args: [
      {
        workspaceId,
        agentConfigurationId,
        useBatchMode,
        conversationLookbackDays,
        disableNotifications,
      },
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  logger.info(
    { workflowId, workspaceId, agentConfigurationId },
    "[ReinforcedAgent] Started agent workflow."
  );
  return new Ok(workflowId);
}
