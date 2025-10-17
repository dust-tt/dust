import * as _ from "lodash";
import { Op } from "sequelize";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationRequirementsFromActions } from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

interface AgentUpdateStats {
  total: number;
  updated: number;
  errors: number;
}

async function updateAgentRequestedSpaceIds(
  auth: Authenticator,
  agent: AgentConfiguration,
  execute: boolean,
  logger: Logger
): Promise<{ updated: boolean; error?: string }> {
  try {
    // Skip if requestedSpaceIds is already populated
    if (agent.requestedSpaceIds.length > 0) {
      logger.info(
        { agentId: agent.sId },
        "Agent already has requestedSpaceIds, skipping"
      );
      return { updated: false };
    }

    // Get the full agent configuration with actions
    const agentConfigurationList = await getAgentConfigurations(auth, {
      agentIds: [agent.sId],
      variant: "full",
    });
    const agentConfiguration = agentConfigurationList[0];

    if (!agentConfiguration) {
      logger.info({ agentId: agent.sId }, "Agent configuration not found");
      return { updated: false, error: "Agent configuration not found" };
    }

    // Calculate the correct space IDs from actions
    const requirements = await getAgentConfigurationRequirementsFromActions(
      auth,
      { actions: agentConfiguration.actions }
    );

    // Skip if no space IDs are required
    if (
      !requirements.requestedSpaceIds ||
      requirements.requestedSpaceIds.length === 0
    ) {
      logger.info(
        { agentId: agent.sId },
        "Agent has no space requirements, skipping"
      );
      return { updated: false };
    }

    logger.info(
      {
        agentId: agent.sId,
        agentName: agent.name,
        newSpaceIds: requirements.requestedSpaceIds,
        execute,
      },
      "Updating agent requestedSpaceIds"
    );

    if (execute) {
      await AgentConfiguration.update(
        {
          requestedSpaceIds: requirements.requestedSpaceIds,
        },
        { where: { sId: agent.sId } }
      );
    }

    return { updated: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { agentId: agent.sId, error: errorMessage },
      "Error updating agent requestedSpaceIds"
    );
    return { updated: false, error: errorMessage };
  }
}

async function updateAgentsForWorkspace(
  workspaceId: string,
  execute: boolean,
  logger: Logger
): Promise<AgentUpdateStats> {
  const workspace = await WorkspaceModel.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    logger.error({ workspaceId }, "Workspace not found");
    return { total: 0, updated: 0, errors: 0 };
  }

  logger.info(
    { workspaceId, workspaceName: workspace.name, execute },
    "Processing workspace"
  );

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  // Find all agent configurations (active and archived, but not draft) with empty requestedSpaceIds
  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      status: {
        [Op.in]: ["active", "archived"],
      },
      requestedSpaceIds: [],
    },
    attributes: ["id", "sId", "name", "requestedSpaceIds", "status"],
  });

  logger.info(
    { workspaceId, agentCount: agents.length },
    "Found agents (active and archived) with empty requestedSpaceIds"
  );

  const stats: AgentUpdateStats = {
    total: agents.length,
    updated: 0,
    errors: 0,
  };

  // Process agents in chunks to avoid overwhelming the system
  const agentChunks = _.chunk(agents, 10);

  for (const chunk of agentChunks) {
    const results = await concurrentExecutor(
      chunk,
      async (agent) =>
        updateAgentRequestedSpaceIds(auth, agent, execute, logger),
      { concurrency: 5 }
    );

    for (const result of results) {
      if (result.error) {
        stats.errors++;
      } else if (result.updated) {
        stats.updated++;
      }
    }
  }

  logger.info(
    {
      workspaceId,
      workspaceName: workspace.name,
      stats,
      execute,
    },
    "Completed workspace processing"
  );

  return stats;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Specific workspace SID to process",
      required: false,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    logger.info(
      { execute, workspaceId },
      "Starting agent requestedSpaceIds backfill"
    );

    const globalStats: AgentUpdateStats = {
      total: 0,
      updated: 0,
      errors: 0,
    };

    if (workspaceId) {
      // Process specific workspace
      const stats = await updateAgentsForWorkspace(
        workspaceId,
        execute,
        logger
      );
      globalStats.total += stats.total;
      globalStats.updated += stats.updated;
      globalStats.errors += stats.errors;
    } else {
      // Process all workspaces
      await runOnAllWorkspaces(
        async (workspace) => {
          const stats = await updateAgentsForWorkspace(
            workspace.sId,
            execute,
            logger
          );
          globalStats.total += stats.total;
          globalStats.updated += stats.updated;
          globalStats.errors += stats.errors;
        },
        { concurrency: 3 }
      );
    }

    logger.info(
      {
        execute,
        globalStats,
      },
      execute
        ? "Completed agent requestedSpaceIds backfill"
        : "Dry run completed - would have backfilled agent requestedSpaceIds"
    );

    if (globalStats.errors > 0) {
      logger.warn(
        { errorCount: globalStats.errors },
        "Some agents failed to update - check logs for details"
      );
    }
  }
);
