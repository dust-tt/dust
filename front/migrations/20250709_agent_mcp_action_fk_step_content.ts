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
  verbose,
  logger,
}: {
  workspace: LightWorkspaceType;
  execute: boolean;
  verbose: boolean;
  logger: Logger;
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
  let batchNumber = 0;

  if (verbose) {
    logger.info(
      { workspaceId: workspace.sId, workspaceName: workspace.name },
      "Starting to process workspace"
    );

    // Count total actions first.
    const totalCount = await AgentMCPAction.count({
      where: {
        workspaceId: workspace.id,
        stepContentId: {
          [Op.is]: null,
        },
      },
    });
    logger.info(
      { workspaceId: workspace.sId, totalCount },
      "Total MCP actions without stepContentId"
    );

    if (totalCount === 0) {
      return {
        workspaceId: workspace.sId,
        nbActionsToProcess: 0,
        nbActionsLinked: 0,
        nbActionsSkipped: 0,
      };
    }
  }

  do {
    batchNumber++;
    if (verbose) {
      logger.info(
        {
          workspaceId: workspace.sId,
          batchNumber,
          lastId,
          batchSize: FETCH_ACTIONS_BATCH_SIZE,
        },
        "Fetching next batch of MCP actions..."
      );
    }

    const startTime = Date.now();
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

    if (verbose) {
      const fetchTime = Date.now() - startTime;
      logger.info(
        {
          workspaceId: workspace.sId,
          batchNumber,
          foundActions: mcpActions.length,
          fetchTimeMs: fetchTime,
        },
        "Fetched MCP actions"
      );
    }

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
      async (mcpAction, index) => {
        if (verbose) {
          logger.info(
            {
              workspaceId: workspace.sId,
              actionId: mcpAction.id,
              agentMessageId: mcpAction.agentMessageId,
              step: mcpAction.step,
              version: mcpAction.version,
              progress: `${index + 1}/${mcpActions.length}`,
            },
            "Processing MCP action"
          );
        }
        // We look for a matching agent step content.
        const stepContentStartTime = verbose ? Date.now() : 0;
        const stepContents = await AgentStepContentModel.findAll({
          where: {
            agentMessageId: mcpAction.agentMessageId,
            step: mcpAction.step,
            workspaceId: workspace.id,
            type: "function_call",
            version: mcpAction.version,
          },
        });

        if (verbose) {
          const stepContentFetchTime = Date.now() - stepContentStartTime;
          logger.info(
            {
              workspaceId: workspace.sId,
              actionId: mcpAction.id,
              foundStepContents: stepContents.length,
              fetchTimeMs: stepContentFetchTime,
            },
            "Fetched step contents"
          );
        }

        if (stepContents.length === 0) {
          return false;
        }

        const matchingStepContent = stepContents.find(
          (sc) =>
            isFunctionCallContent(sc.value) &&
            sc.value.value.id === mcpAction.functionCallId
        );

        if (!matchingStepContent) {
          if (verbose) {
            logger.info(
              { workspaceId: workspace.sId, actionId: mcpAction.id },
              "No matching step content found"
            );
          }
          return false;
        }

        // If the step content is found, we can attach it to the MCP action.
        if (execute) {
          if (verbose) {
            const updateStartTime = Date.now();
            await mcpAction.update({ stepContentId: matchingStepContent.id });
            const updateTime = Date.now() - updateStartTime;
            logger.info(
              {
                workspaceId: workspace.sId,
                actionId: mcpAction.id,
                stepContentId: matchingStepContent.id,
                updateTimeMs: updateTime,
              },
              "Updated MCP action with stepContentId"
            );
          } else {
            await mcpAction.update({ stepContentId: matchingStepContent.id });
          }
        }
        return true;
      },
      { concurrency: UPDATE_ACTION_CONCURRENCY }
    );

    nbActionsToProcess += result.length;
    nbActionsLinked += result.filter((r) => r === true).length;
    nbActionsSkipped += result.filter((r) => r === false).length;
    hasMore = mcpActions.length === FETCH_ACTIONS_BATCH_SIZE;
    if (mcpActions.length > 0) {
      lastId = mcpActions[mcpActions.length - 1].id;
    }

    if (verbose) {
      logger.info(
        {
          workspaceId: workspace.sId,
          batchNumber,
          progress: {
            processed: nbActionsToProcess,
            linked: nbActionsLinked,
            skipped: nbActionsSkipped,
          },
        },
        "Batch completed"
      );
    }
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
  {
    execute,
    logger,
    verbose,
  }: { execute: boolean; logger: Logger; verbose: boolean }
) {
  const stats = await attachStepContentToMcpActions({
    workspace,
    execute,
    verbose,
    logger,
  });
  if (stats.nbActionsToProcess > 0 || verbose) {
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
    verbose: {
      type: "boolean",
      description: "Enable verbose logging to debug slow queries",
      required: false,
      default: false,
    },
  },
  async ({ execute, workspaceId, verbose }, logger) => {
    if (verbose) {
      logger.info(
        { execute, workspaceId },
        "Starting migration with verbose logging enabled"
      );
    }
    if (workspaceId) {
      const workspace = await getWorkspaceInfos(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }
      await migrateForWorkspace(workspace, { execute, logger, verbose });
    } else {
      return runOnAllWorkspaces(
        async (workspace) => {
          await migrateForWorkspace(workspace, { execute, logger, verbose });
        },
        { concurrency: WORKSPACE_CONCURRENCY }
      );
    }
  }
);
