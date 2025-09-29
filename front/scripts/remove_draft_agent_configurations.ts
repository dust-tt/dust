import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentChildAgentConfiguration,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Mention } from "@app/lib/models/assistant/conversation";
import { TagAgentModel } from "@app/lib/models/assistant/tag_agent";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

/**
 * Destroys a draft agent configuration and all associated configurations.
 * Avoids using transactions to prevent locks.
 * Deletes the agent configuration last, allowing retries if deletion fails.
 *
 * /!\ Only deletes draft agent configuration if it hasn't been used in any messages.
 */
async function deleteDraftAgentConfigurationAndRelatedResources(
  workspace: LightWorkspaceType,
  agent: AgentConfiguration,
  logger: Logger,
  execute: boolean
): Promise<boolean> {
  if (agent.status !== "draft") {
    logger.info(`Agent ${agent.sId} is not in draft status. Skipping.`);
    return false;
  }

  // Only deletes draft agent configuration without mentions.
  const hasAtLeastOneMention = await Mention.findOne({
    where: {
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
    },
  });
  if (hasAtLeastOneMention) {
    logger.info(`Agent ${agent.sId} has related messages. Skipping.`);

    return false;
  }

  // If in dry run, return early.
  if (!execute) {
    return true;
  }

  const mcpServerConfigurations = await AgentMCPServerConfiguration.findAll({
    where: {
      agentConfigurationId: agent.id,
    },
  });

  await AgentDataSourceConfiguration.destroy({
    where: {
      mcpServerConfigurationId: mcpServerConfigurations.map((r) => r.id),
    },
  });

  await AgentTablesQueryConfigurationTable.destroy({
    where: {
      mcpServerConfigurationId: mcpServerConfigurations.map((r) => r.id),
    },
  });

  await AgentReasoningConfiguration.destroy({
    where: {
      mcpServerConfigurationId: mcpServerConfigurations.map((r) => r.id),
    },
  });

  await AgentChildAgentConfiguration.destroy({
    where: {
      mcpServerConfigurationId: mcpServerConfigurations.map((r) => r.id),
    },
  });

  await TagAgentModel.destroy({
    where: {
      agentConfigurationId: agent.id,
    },
  });

  // Finally delete the agent configuration.
  await AgentConfiguration.destroy({
    where: {
      id: agent.id,
    },
  });

  return true;
}

async function removeDraftAgentConfigurationsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  let nbAgentsDeleted = 0;

  const draftAgents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      status: "draft",
    },
    attributes: ["id", "sId", "status"],
  });

  if (draftAgents.length === 0) {
    logger.info(
      `No draft agents found for workspace(${workspace.sId}). Skipping.`
    );
    return;
  }

  logger.info(
    `Found ${draftAgents.length} draft agents for workspace(${workspace.sId}).`
  );

  for (const agent of draftAgents) {
    const isDeleted = await deleteDraftAgentConfigurationAndRelatedResources(
      workspace,
      agent,
      logger,
      execute
    );

    if (isDeleted) {
      nbAgentsDeleted++;
      logger.info(`Agent ${agent.sId} has been deleted.`);
    }
  }

  logger.info(
    `Deleted ${nbAgentsDeleted}/${draftAgents.length} draft agents for workspace(${workspace.sId}).`
  );
}

makeScript(
  {
    concurrency: {
      type: "number",
      description: "The number of workspaces to process concurrently.",
      default: 8,
    },
    workspaceId: {
      type: "string",
      description: "A single workspace id.",
    },
  },
  async ({ workspaceId, execute }, logger) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        logger.info({ workspaceId }, "Workspace not found!");
        return;
      }

      return removeDraftAgentConfigurationsForWorkspace(
        renderLightWorkspaceType({ workspace }),
        logger,
        execute
      );
    }

    return runOnAllWorkspaces(async (workspace) => {
      await removeDraftAgentConfigurationsForWorkspace(
        workspace,
        logger,
        execute
      );
    });
  }
);
