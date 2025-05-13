import { Op } from "sequelize";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Mention } from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

async function deleteRetrievalConfigurationForAgent(
  workspace: LightWorkspaceType,
  agent: AgentConfiguration
) {
  const retrievalConfigurations = await AgentRetrievalConfiguration.findAll({
    where: {
      agentConfigurationId: agent.id,
      workspaceId: workspace.id,
    },
  });

  if (retrievalConfigurations.length === 0) {
    return;
  }

  await AgentDataSourceConfiguration.destroy({
    where: {
      retrievalConfigurationId: {
        [Op.in]: retrievalConfigurations.map((r) => r.id),
      },
    },
  });

  await AgentRetrievalConfiguration.destroy({
    where: {
      agentConfigurationId: agent.id,
      workspaceId: workspace.id,
    },
  });
}

async function deleteDustAppRunConfigurationForAgent(
  agent: AgentConfiguration
) {
  const dustAppRunConfigurations = await AgentDustAppRunConfiguration.findAll({
    where: {
      agentConfigurationId: agent.id,
      workspaceId: agent.workspaceId,
    },
  });

  if (dustAppRunConfigurations.length === 0) {
    return;
  }

  await AgentDustAppRunConfiguration.destroy({
    where: {
      agentConfigurationId: agent.id,
      workspaceId: agent.workspaceId,
    },
  });
}

async function deleteTableQueryConfigurationForAgent(
  agent: AgentConfiguration
) {
  const tableQueryConfigurations = await AgentTablesQueryConfiguration.findAll({
    where: {
      agentConfigurationId: agent.id,
      workspaceId: agent.workspaceId,
    },
  });

  if (tableQueryConfigurations.length === 0) {
    return;
  }

  await AgentTablesQueryConfigurationTable.destroy({
    where: {
      tablesQueryConfigurationId: {
        [Op.in]: tableQueryConfigurations.map((r) => r.id),
      },
    },
  });

  await AgentTablesQueryConfiguration.destroy({
    where: {
      agentConfigurationId: agent.id,
      workspaceId: agent.workspaceId,
    },
  });
}

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

  // Delete the retrieval configurations.
  await deleteRetrievalConfigurationForAgent(workspace, agent);

  // Delete the dust app run configurations.
  await deleteDustAppRunConfigurationForAgent(agent);

  // Delete the table query configurations.
  await deleteTableQueryConfigurationForAgent(agent);

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
      const workspace = await Workspace.findOne({
        where: {
          sId: workspaceId,
        },
      });
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
