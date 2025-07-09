import { Op } from "sequelize";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";

const FETCH_ACTIONS_BATCH_SIZE = 200;
const WORKSPACE_CONCURRENCY = 5;
const UPDATE_ACTION_CONCURRENCY = 10;

/**
 * Attach an AgentStepContent to all AgentMCPActions that don't have one for a given workspace.
 *
 * If no matching step content is found we skip the action. We do not warn or error log, unprocessed actions will be seen in DB.
 * We only log at the end of the loop the number of actions skipped, updated and processed.
 */
async function attachStepContentToMcpActions({
  workspace,
  execute,
}: {
  workspace: LightWorkspaceType;
  execute: boolean;
}): Promise<{
  workspaceId: string;
  nbActionsToProcess: number;
  nbActionsLinked: number;
  nbActionsSkipped: number;
}> {
  let nbActionsToProcess = 0;
  let nbActionsLinked = 0;
  let nbActionsSkipped = 0;
  let hasMore = false;
  let lastId = 0;

  do {
    const mcpActions = await AgentMCPAction.findAll({
      where: {
        workspaceId: workspace.id,
        id: {
          [Op.gt]: lastId,
        },
        stepContentId: {
          [Op.is]: null,
        },
      },
      limit: FETCH_ACTIONS_BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    if (mcpActions.length === 0) {
      return {
        workspaceId: workspace.sId,
        nbActionsToProcess: 0,
        nbActionsLinked: 0,
        nbActionsSkipped: 0,
      };
    }

    const result = await concurrentExecutor(
      mcpActions,
      async (mcpAction) => {
        // We look for a matching agent step content.
        const stepContents = await AgentStepContentModel.findAll({
          where: {
            workspaceId: workspace.id,
            type: "function_call",
            agentMessageId: mcpAction.agentMessageId,
            step: mcpAction.step,
            version: mcpAction.version,
          },
        });

        if (stepContents.length === 0) {
          return false;
        }

        const matchingStepContent = stepContents.find(
          (sc) =>
            isFunctionCallContent(sc.value) &&
            sc.value.value.id === mcpAction.functionCallId
        );

        if (!matchingStepContent) {
          return false;
        }

        // If the step content is found, we can attach it to the MCP action.
        if (execute) {
          await mcpAction.update({ stepContentId: matchingStepContent.id });
        }
        return true;
      },
      { concurrency: UPDATE_ACTION_CONCURRENCY }
    );

    nbActionsToProcess += result.length;
    nbActionsLinked += result.filter((r) => r === true).length;
    nbActionsSkipped += result.filter((r) => r === false).length;
    hasMore = mcpActions.length === FETCH_ACTIONS_BATCH_SIZE;
    lastId = mcpActions[mcpActions.length - 1].id;
  } while (hasMore);

  return {
    workspaceId: workspace.sId,
    nbActionsToProcess,
    nbActionsLinked,
    nbActionsSkipped,
  };
}

/**
 * Run the migration for a given workspace.
 */
async function migrateForWorkspace(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  const stats = await attachStepContentToMcpActions({ workspace, execute });
  if (stats.nbActionsToProcess > 0) {
    logger.info(stats, "Completed processing MCP actions for workspace.");
  }
}

/**
 * This migration attaches an AgentStepContent to all AgentMCPActions that don't have one.
 * Can be run on a single workspace or (default) all workspaces.
 */
makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace ID to migrate",
      required: false,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    if (workspaceId) {
      const workspace = await getWorkspaceInfos(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }
      await migrateForWorkspace(workspace, { execute, logger });
    } else {
      return runOnAllWorkspaces(
        async (workspace) => {
          await migrateForWorkspace(workspace, { execute, logger });
        },
        { concurrency: WORKSPACE_CONCURRENCY }
      );
    }
  }
);
