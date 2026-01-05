import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import {
  AgentConfigurationModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

async function deleteAgentAndRelatedResources(
  auth: Authenticator,
  agent: AgentConfigurationModel,
  logger: Logger,
  execute: boolean
): Promise<boolean> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  logger.info(
    { agentSId: agent.sId, agentId: agent.id, agentName: agent.name },
    "Processing agent for deletion"
  );

  if (!execute) {
    return true;
  }

  // 1. Delete MCP server configurations and their children
  const mcpServerConfigurations =
    await AgentMCPServerConfigurationModel.findAll({
      where: {
        agentConfigurationId: agent.id,
        workspaceId,
      },
    });

  if (mcpServerConfigurations.length > 0) {
    const mcpIds = mcpServerConfigurations.map((r) => r.id);

    await AgentDataSourceConfigurationModel.destroy({
      where: {
        mcpServerConfigurationId: { [Op.in]: mcpIds },
      },
    });

    await AgentTablesQueryConfigurationTableModel.destroy({
      where: {
        mcpServerConfigurationId: { [Op.in]: mcpIds },
      },
    });

    await AgentChildAgentConfigurationModel.destroy({
      where: {
        mcpServerConfigurationId: { [Op.in]: mcpIds.map((id) => `${id}`) },
        workspaceId,
      },
    });

    await AgentMCPServerConfigurationModel.destroy({
      where: {
        agentConfigurationId: agent.id,
        workspaceId,
      },
    });
  }

  // 2. Delete user relations (favorites, etc.)
  await AgentUserRelationModel.destroy({
    where: {
      agentConfiguration: agent.sId,
    },
  });

  // 3. Delete tag associations
  await TagAgentModel.destroy({
    where: {
      agentConfigurationId: agent.id,
      workspaceId,
    },
  });

  // 4. Delete agent memories
  await AgentMemoryModel.destroy({
    where: {
      agentConfigurationId: agent.sId,
      workspaceId,
    },
  });

  // 5. Delete agent skills
  await AgentSkillModel.destroy({
    where: {
      agentConfigurationId: agent.id,
      workspaceId,
    },
  });

  // 6. Delete editor group (if exists)
  const group = await GroupResource.fetchByAgentConfiguration({
    auth,
    agentConfiguration: agent,
    isDeletionFlow: true,
  });
  if (group) {
    await group.delete(auth);
  }

  // 7. Finally delete the agent configuration itself
  await agent.destroy();

  logger.info(
    { agentSId: agent.sId, agentId: agent.id },
    "Successfully deleted agent"
  );

  return true;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "The workspace sId",
      demandOption: true,
    },
    userId: {
      type: "number",
      description: "The numeric user ID (authorId) whose agents to delete",
      demandOption: true,
    },
  },
  async ({ workspaceId, userId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    // Find all agents authored by this user in this workspace
    const agents = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        authorId: userId,
      },
    });

    if (agents.length === 0) {
      logger.info(
        { workspaceId, userId },
        "No agents found for this user in this workspace"
      );
      return;
    }

    logger.info(
      { workspaceId, userId, agentCount: agents.length },
      `Found ${agents.length} agent(s) to delete`
    );

    for (const agent of agents) {
      await deleteAgentAndRelatedResources(auth, agent, logger, execute);
    }

    logger.info(
      {
        workspaceId,
        userId,
        totalAgents: agents.length,
        dryRun: !execute,
      },
      execute
        ? `Completed: deleted ${agents.length} agents`
        : `Dry run: would delete ${agents.length} agents`
    );
  }
);
