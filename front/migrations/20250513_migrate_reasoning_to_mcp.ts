import { Op } from "sequelize";

import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

/**
 * Migrates reasoning actions from non-MCP to MCP version for a specific workspace
 */
async function migrateWorkspaceReasoningActions({
  wId,
  execute,
  logger,
}: {
  wId: string;
  execute: boolean;
  logger: typeof Logger;
}): Promise<void> {
  // Get admin auth for the workspace
  const auth = await Authenticator.internalAdminForWorkspace(wId);

  // Find all existing reasoning configurations that are linked to an agent configuration
  // (non-MCP version) and not yet linked to an MCP server configuration
  const reasoningConfigs = await AgentReasoningConfiguration.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentConfigurationId: { [Op.not]: null },
      mcpServerConfigurationId: null,
    },
  });

  logger.info(
    `Found ${reasoningConfigs.length} reasoning configurations to migrate`
  );

  if (reasoningConfigs.length === 0) {
    logger.info("No reasoning configurations to migrate");
    return;
  }

  // Get the system space to create the MCP server view
  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

  // Get the reasoning_v2 MCP server ID
  const reasoningMcpServerId = internalMCPServerNameToSId({
    name: "reasoning_v2",
    workspaceId: auth.getNonNullableWorkspace().id,
  });

  // Check if the reasoning_v2 MCP server view already exists in the system space
  const mcpServerViews = await MCPServerViewResource.listByMCPServer(
    auth,
    reasoningMcpServerId
  );

  if (!execute) {
    logger.info("Dry run - would create the following MCP configurations:");
    for (const config of reasoningConfigs) {
      logger.info(
        `  - Reasoning config ${config.sId} for agent ${config.agentConfigurationId}`
      );
    }
    return;
  }

  // Create the MCP server view if it doesn't exist
  let mcpServerViewResource: MCPServerViewResource;
  if (mcpServerViews.length === 0) {
    logger.info("Creating reasoning MCP server view");
    mcpServerViewResource = await MCPServerViewResource.create(auth, {
      mcpServerId: reasoningMcpServerId,
      space: systemSpace,
    });
  } else {
    mcpServerViewResource = await MCPServerViewResource.fetchByModelPk(
      auth,
      mcpServerViews[0].id
    );
    if (!mcpServerViewResource) {
      throw new Error("Failed to fetch MCP server view");
    }
  }

  // For each reasoning configuration, create an MCP server configuration and link it
  await concurrentExecutor(
    reasoningConfigs,
    async (reasoningConfig) => {
      // Create a new AgentMCPServerConfiguration
      const mcpConfig = await AgentMCPServerConfiguration.create({
        sId: generateRandomModelSId(),
        agentConfigurationId: reasoningConfig.agentConfigurationId,
        workspaceId: auth.getNonNullableWorkspace().id,
        mcpServerViewId: mcpServerViewResource.id,
        internalMCPServerId: reasoningMcpServerId,
        additionalConfiguration: {},
        timeFrame: null,
        name: reasoningConfig.name,
        singleToolDescriptionOverride: reasoningConfig.description,
        appId: null,
      });

      // Update the reasoning configuration to link it to the MCP server configuration
      await reasoningConfig.update({
        mcpServerConfigurationId: mcpConfig.id,
        agentConfigurationId: null,
      });

      logger.info(
        `Migrated reasoning config ${reasoningConfig.sId} to MCP server config ${mcpConfig.sId}`
      );
    },
    { concurrency: 5 }
  );

  logger.info(
    `Successfully migrated ${reasoningConfigs.length} reasoning configurations to MCP`
  );
}

makeScript(
  {
    wId: {
      type: "string",
      description: "Workspace ID to migrate",
      demandOption: true,
    },
  },
  async ({ execute, wId }, logger) => {
    const workspaceLogger = logger.child({ workspaceId: wId });
    workspaceLogger.info("Starting migration of reasoning actions to MCP");

    await migrateWorkspaceReasoningActions({
      wId,
      execute,
      logger: workspaceLogger,
    });

    workspaceLogger.info("Migration completed");
  }
);
