import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
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
    order: [["id", "ASC"]],
  });

  if (reasoningConfigs.length === 0) {
    logger.info("No reasoning configurations to migrate");
    return;
  }

  logger.info(
    `Found ${reasoningConfigs.length} reasoning configurations to migrate`
  );

  // Create the MCP server views in system and global spaces.
  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "reasoning_v2"
    );
  if (!mcpServerView) {
    throw new Error("Reasoning MCP server view not found.");
  }

  // For each reasoning configuration, create an MCP server configuration and link it
  await concurrentExecutor(
    reasoningConfigs,
    async (reasoningConfig) => {
      if (!reasoningConfig.agentConfigurationId) {
        // This should never happen since we fetch where agentConfigurationId is not null.
        // The data model is a bit ugly, this was a bit temporary.
        logger.info(
          { configModelId: reasoningConfig.id },
          `Already an MCP reasoning config, skipping`
        );
        return;
      }

      if (execute) {
        const mcpConfig = await AgentMCPServerConfiguration.create({
          sId: generateRandomModelSId(),
          agentConfigurationId: reasoningConfig.agentConfigurationId,
          workspaceId: auth.getNonNullableWorkspace().id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.mcpServerId,
          additionalConfiguration: {},
          timeFrame: null,
          name: reasoningConfig.name,
          singleToolDescriptionOverride: reasoningConfig.description,
          appId: null,
        });

        // Untie the reasoning config from the agent configuration and move it to the MCP server configuration.
        await reasoningConfig.update({
          mcpServerConfigurationId: mcpConfig.id,
          agentConfigurationId: null,
        });

        // Log the model IDs for an easier rollback.
        logger.info(
          {
            configModelId: reasoningConfig.id,
            mcpConfigModelId: mcpConfig.id,
          },
          `Migrated reasoning config to MCP server config`
        );
      }
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
