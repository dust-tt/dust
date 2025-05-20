import fs from "fs";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

async function findWorkspacesWithReasoningConfigurations(): Promise<ModelId[]> {
  const reasoningConfigurations = await AgentReasoningConfiguration.findAll({
    attributes: ["workspaceId"],
    where: {
      agentConfigurationId: { [Op.not]: null },
      mcpServerConfigurationId: null,
    },
    // Filter on active agents.
    include: [
      {
        attributes: [],
        model: AgentConfiguration,
        required: true,
        where: {
          status: "active",
        },
      },
    ],
    order: [["id", "ASC"]],
  });

  return reasoningConfigurations.map((config) => config.workspaceId);
}

/**
 * Migrates reasoning actions from non-MCP to MCP version for a specific workspace.
 */
async function migrateWorkspaceReasoningActions(
  auth: Authenticator,
  {
    execute,
    parentLogger,
  }: {
    execute: boolean;
    parentLogger: typeof Logger;
  }
): Promise<string> {
  const logger = parentLogger.child({
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  logger.info("Starting migration of reasoning actions to MCP.");

  // Find all existing reasoning configurations that are linked to an agent configuration
  // (non-MCP version) and not yet linked to an MCP server configuration.
  const reasoningConfigs = await AgentReasoningConfiguration.findAll({
    where: {
      // No index here so that might be slow.
      workspaceId: auth.getNonNullableWorkspace().id,
      agentConfigurationId: { [Op.not]: null },
      mcpServerConfigurationId: null,
    },
    // Filter on active agents.
    include: [
      {
        attributes: [],
        model: AgentConfiguration,
        required: true,
        where: {
          status: "active",
        },
      },
    ],
    order: [["id", "ASC"]],
  });

  if (reasoningConfigs.length === 0) {
    return "";
  }

  logger.info(
    `Found ${reasoningConfigs.length} reasoning configurations to migrate.`
  );

  if (execute) {
    // Create the MCP server views in system and global spaces.
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  }

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "reasoning_v2"
    );
  if (!mcpServerView) {
    throw new Error("Reasoning MCP server view not found.");
  }

  let revertSql = "";

  // For each reasoning configuration, create an MCP server configuration and link it.
  await concurrentExecutor(
    reasoningConfigs,
    async (reasoningConfig) => {
      if (!reasoningConfig.agentConfigurationId) {
        // This should never happen since we fetch where agentConfigurationId is not null.
        // The data model is a bit ugly, this was a bit temporary.
        logger.info(
          { reasoningConfigurationId: reasoningConfig.id },
          `Already an MCP reasoning config, skipping.`
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

        revertSql += `UPDATE "agent_reasoning_configurations" SET "agentConfigurationId" = '${reasoningConfig.agentConfigurationId}' WHERE "id" = '${reasoningConfig.id}';\n`;
        revertSql += `UPDATE "agent_reasoning_configurations" SET "mcpServerConfigurationId" = NULL WHERE "id" = '${reasoningConfig.id}';\n`;
        revertSql += `DELETE FROM "agent_mcp_server_configurations" WHERE "id" = '${mcpConfig.id}';\n`;

        // Untie the reasoning config from the agent configuration and move it to the MCP server configuration.
        await reasoningConfig.update({
          mcpServerConfigurationId: mcpConfig.id,
          agentConfigurationId: null,
        });

        // Log the model IDs for an easier rollback.
        logger.info(
          {
            reasoningConfigurationId: reasoningConfig.id,
            mcpServerConfigurationId: mcpConfig.id,
          },
          `Migrated reasoning config to MCP server config.`
        );
      } else {
        logger.info(
          {
            reasoningConfigurationId: reasoningConfig.id,
          },
          `Would create MCP server config and migrate reasoning config to it.`
        );
      }
    },
    { concurrency: 10 }
  );

  if (execute) {
    logger.info(
      `Successfully migrated ${reasoningConfigs.length} reasoning configurations to MCP.`
    );
  } else {
    logger.info(
      `Would have migrated ${reasoningConfigs.length} reasoning configurations to MCP.`
    );
  }

  return revertSql;
}

makeScript(
  {
    startFromWorkspaceId: {
      type: "number",
      description: "Workspace ID to start from",
      required: false,
    },
  },
  async ({ execute, startFromWorkspaceId }, parentLogger) => {
    const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    const workspaceIds = await findWorkspacesWithReasoningConfigurations();
    const workspaces = await Workspace.findAll({
      where: {
        id: { [Op.in]: workspaceIds },
        ...(startFromWorkspaceId
          ? { id: { [Op.gte]: startFromWorkspaceId } }
          : {}),
      },
      order: [["id", "ASC"]],
    });

    let revertSql = "";
    for (const workspace of workspaces) {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const workspaceRevertSql = await migrateWorkspaceReasoningActions(auth, {
        execute,
        parentLogger,
      });

      if (execute) {
        fs.writeFileSync(
          `${now}_reasoning_to_mcp_revert_${workspace.sId}.sql`,
          workspaceRevertSql
        );
      }
      revertSql += workspaceRevertSql;
    }

    if (execute) {
      fs.writeFileSync(`${now}_reasoning_to_mcp_revert_all.sql`, revertSql);
    }
  }
);
