import fs from "fs";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentTablesQueryConfiguration, AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

/**
 * Migrates tables query actions from non-MCP to MCP version for a specific workspace
 */
async function migrateWorkspaceTablesQueryActions({
  wId,
  execute,
  parentLogger,
}: {
  wId: string;
  execute: boolean;
  parentLogger: typeof Logger;
}): Promise<string> {
  const logger = parentLogger.child({
    workspaceId: wId,
  });

  logger.info("Starting migration of tables query actions to MCP.");

  // Get admin auth for the workspace
  const auth = await Authenticator.internalAdminForWorkspace(wId);

  // Find all existing tables query configurations that are linked to an agent configuration
  // (non-MCP version) and not yet linked to an MCP server configuration
  const tablesQueryConfigs = await AgentTablesQueryConfiguration.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentConfigurationId: { [Op.not]: null },
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

  if (tablesQueryConfigs.length === 0) {
    return "";
  }

  logger.info(
    `Found ${tablesQueryConfigs.length} tables query configurations to migrate.`
  );

  if (execute) {
    // Create the MCP server views in system and global spaces.
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  }

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "query_tables_v2"
    );
  if (!mcpServerView) {
    throw new Error("Tables Query MCP server view not found.");
  }

  let revertSql = "";

  // For each tables query configuration, create an MCP server configuration and update relationships
  await concurrentExecutor(
    tablesQueryConfigs,
    async (tablesQueryConfig) => {
      if (!tablesQueryConfig.agentConfigurationId) {
        // This should never happen since we fetch where agentConfigurationId is not null.
        logger.info(
          { tablesQueryConfigurationId: tablesQueryConfig.id },
          `Already an MCP tables query config, skipping.`
        );
        return;
      }

      if (execute) {
        // Find all tables associated with this configuration
        const tables = await AgentTablesQueryConfigurationTable.findAll({
          where: {
            tablesQueryConfigurationId: tablesQueryConfig.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          }
        });

        // Create MCP server configuration
        const mcpConfig = await AgentMCPServerConfiguration.create({
          sId: generateRandomModelSId(),
          agentConfigurationId: tablesQueryConfig.agentConfigurationId,
          workspaceId: auth.getNonNullableWorkspace().id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.internalMCPServerId,
          additionalConfiguration: {},
          timeFrame: null,
          name: tablesQueryConfig.name,
          singleToolDescriptionOverride: tablesQueryConfig.description,
          appId: null,
        });

        // Add revert SQL for the tables query configuration
        revertSql += `UPDATE "agent_tables_query_configurations" SET "agentConfigurationId" = '${tablesQueryConfig.agentConfigurationId}' WHERE "id" = '${tablesQueryConfig.id}';\n`;

        // Update the tables to link to the MCP server configuration
        for (const table of tables) {
          await table.update({
            mcpServerConfigurationId: mcpConfig.id,
            tablesQueryConfigurationId: null,
          });

          // Add revert SQL for each table
          revertSql += `UPDATE "agent_tables_query_configuration_tables" SET "tablesQueryConfigurationId" = '${tablesQueryConfig.id}', "mcpServerConfigurationId" = NULL WHERE "id" = '${table.id}';\n`;
        }

        // Add revert SQL to delete the MCP server configuration
        revertSql += `DELETE FROM "agent_mcp_server_configurations" WHERE "id" = '${mcpConfig.id}';\n`;

        // Log the model IDs for an easier rollback.
        logger.info(
          {
            tablesQueryConfigurationId: tablesQueryConfig.id,
            mcpServerConfigurationId: mcpConfig.id,
            tablesCount: tables.length,
          },
          `Migrated tables query config to MCP server config.`
        );
      } else {
        // Find count of tables for logging purposes
        const tablesCount = await AgentTablesQueryConfigurationTable.count({
          where: {
            tablesQueryConfigurationId: tablesQueryConfig.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          }
        });

        logger.info(
          {
            tablesQueryConfigurationId: tablesQueryConfig.id,
            tablesCount,
          },
          `Would create MCP server config and migrate tables query config to it.`
        );
      }
    },
    { concurrency: 10 }
  );

  if (execute) {
    logger.info(
      `Successfully migrated ${tablesQueryConfigs.length} tables query configurations to MCP.`
    );
  } else {
    logger.info(
      `Would have migrated ${tablesQueryConfigs.length} tables query configurations to MCP.`
    );
  }

  return revertSql;
}

makeScript(
  {
    wId: {
      type: "string",
      description: "Workspace ID to migrate",
      required: true,
    },
  },
  async ({ execute, wId }, parentLogger) => {
    const revertSql = await migrateWorkspaceTablesQueryActions({
      wId,
      execute,
      parentLogger,
    });

    if (execute) {
      const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      fs.writeFileSync(`${now}_tables_query_to_mcp_revert.sql`, revertSql);
    }
  }
);