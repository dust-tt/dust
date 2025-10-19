import * as _ from "lodash";
import { Op } from "sequelize";

import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationRequirementsFromActions } from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { isArrayEqual2DUnordered, normalizeArrays } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface AgentUpdateStats {
  total: number;
  withDustApps: number;
  updated: number;
  errors: number;
}

async function updateAgentConfigurationGroupIds(
  auth: Authenticator,
  agent: AgentConfiguration,
  execute: boolean,
  logger: Logger
): Promise<{ updated: boolean; error?: string }> {
  try {
    // Get the full agent configuration with actions
    const agentConfigurationList = await getAgentConfigurations(auth, {
      agentIds: [agent.sId],
      variant: "full",
    });
    const agentConfiguration = agentConfigurationList;

    if (!agentConfiguration[0]) {
      return { updated: false, error: "Agent configuration not found" };
    }

    const ac = agentConfiguration[0];

    // Check if agent has any dust app configurations
    const hasDustApps = ac.actions.some(
      (action) =>
        action.type === "mcp_server_configuration" &&
        isServerSideMCPServerConfiguration(action) &&
        action.dustAppConfiguration !== null
    );

    if (!hasDustApps) {
      logger.debug(
        { agentId: agent.sId },
        "Agent has no dust app configurations, skipping"
      );
      return { updated: false };
    }

    // Calculate the correct group IDs using the updated function
    const newRequirements = await getAgentConfigurationRequirementsFromActions(
      auth,
      { actions: ac.actions }
    );

    // Normalize the arrays for comparison
    const normalizedNewGroupIds = normalizeArrays(
      newRequirements.requestedGroupIds
    );
    const normalizedCurrentGroupIds = normalizeArrays(agent.requestedGroupIds);

    // Check if the group IDs have changed
    if (
      isArrayEqual2DUnordered(
        normalizedNewGroupIds,
        normalizedCurrentGroupIds
      ) &&
      _.isEqual(newRequirements.requestedSpaceIds, agent.requestedSpaceIds)
    ) {
      logger.debug(
        { agentId: agent.sId },
        "Agent requirements are already up to date"
      );
      return { updated: false };
    }

    logger.info(
      {
        agentId: agent.sId,
        agentName: agent.name,
        currentGroupIds: normalizedCurrentGroupIds,
        newGroupIds: normalizedNewGroupIds,
        execute,
      },
      "Updating agent configuration requirements for permissions"
    );

    if (execute) {
      await AgentConfiguration.update(
        {
          requestedGroupIds: normalizedNewGroupIds,
          requestedSpaceIds: newRequirements.requestedSpaceIds,
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
      "Error updating agent configuration group IDs"
    );
    return { updated: false, error: errorMessage };
  }
}

async function updateAgentsForWorkspace(
  workspaceId: number,
  execute: boolean,
  logger: Logger
): Promise<AgentUpdateStats> {
  const workspace = await WorkspaceModel.findByPk(workspaceId);
  if (!workspace) {
    logger.error({ workspaceId }, "Workspace not found");
    return { total: 0, withDustApps: 0, updated: 0, errors: 0 };
  }

  logger.info(
    { workspaceId, workspaceName: workspace.name, execute },
    "Processing workspace"
  );

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Find all active agent configurations that have MCP actions with dust apps
  const agentsWithDustApps = await AgentConfiguration.findAll({
    where: {
      workspaceId,
      status: "active",
      id: {
        [Op.in]: await AgentMCPServerConfiguration.findAll({
          where: {
            workspaceId,
            appId: { [Op.not]: null },
          },
          attributes: ["agentConfigurationId"],
          group: ["agentConfigurationId"],
        }).then((configs) => configs.map((c) => c.agentConfigurationId)),
      },
    },
    attributes: ["id", "sId", "name", "requestedGroupIds"],
  });

  logger.info(
    { workspaceId, agentCount: agentsWithDustApps.length },
    "Found agents with dust app configurations"
  );

  const stats: AgentUpdateStats = {
    total: agentsWithDustApps.length,
    withDustApps: agentsWithDustApps.length,
    updated: 0,
    errors: 0,
  };

  // Process agents in chunks to avoid overwhelming the system
  const agentChunks = _.chunk(agentsWithDustApps, 10);

  for (const chunk of agentChunks) {
    const results = await concurrentExecutor(
      chunk,
      async (agent) =>
        updateAgentConfigurationGroupIds(auth, agent, execute, logger),
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

async function getWorkspacesWithDustApps(): Promise<number[]> {
  // Find all workspaces that have agents with dust app configurations
  const workspaceIds = await AgentMCPServerConfiguration.findAll({
    where: {
      appId: { [Op.not]: null },
    },
    attributes: ["workspaceId"],
    group: ["workspaceId"],
    raw: true,
  });

  return workspaceIds.map((entry) => entry.workspaceId);
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
      "Starting dust app agent group permissions fix"
    );

    let workspaceModelIds: number[] = [];

    if (workspaceId) {
      // Process specific workspace
      const workspace = await WorkspaceModel.findOne({
        where: { sId: workspaceId },
      });
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }
      workspaceModelIds = [workspace.id];
    } else {
      // Process all workspaces that have agents with dust apps
      workspaceModelIds = await getWorkspacesWithDustApps();
      logger.info(
        { workspaceCount: workspaceModelIds.length },
        "Found workspaces with dust app configurations"
      );
    }

    const globalStats: AgentUpdateStats = {
      total: 0,
      withDustApps: 0,
      updated: 0,
      errors: 0,
    };

    // Process workspaces in chunks
    const workspaceChunks = _.chunk(workspaceModelIds, 5);

    for (const chunk of workspaceChunks) {
      const results = await Promise.all(
        chunk.map((id) => updateAgentsForWorkspace(id, execute, logger))
      );

      for (const stats of results) {
        globalStats.total += stats.total;
        globalStats.withDustApps += stats.withDustApps;
        globalStats.updated += stats.updated;
        globalStats.errors += stats.errors;
      }
    }

    logger.info(
      {
        execute,
        workspaceCount: workspaceModelIds.length,
        globalStats,
      },
      execute
        ? "Completed dust app agent group permissions fix"
        : "Dry run completed - would have fixed dust app agent group permissions"
    );

    if (globalStats.errors > 0) {
      logger.warn(
        { errorCount: globalStats.errors },
        "Some agents failed to update - check logs for details"
      );
    }
  }
);
