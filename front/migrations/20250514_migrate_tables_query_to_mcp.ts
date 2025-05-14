import { format } from "date-fns";
import fs from "fs";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { removeNulls } from "@app/types";

/**
 * Migrates tables query actions from non-MCP to MCP version for a specific workspace.
 * Overall plan is to find the tables configurations,
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
  const workspace = auth.getNonNullableWorkspace();

  // Find all existing tables query configurations that are linked to an active agent configuration
  // First, get all the unique tablesQueryConfigurationIds that need migration
  const tableConfigurations = await AgentTablesQueryConfigurationTable.findAll({
    attributes: ["tablesQueryConfigurationId"],
    where: {
      workspaceId: workspace.id,
      tablesQueryConfigurationId: { [Op.not]: null },
      mcpServerConfigurationId: null,
    },
    include: [
      {
        model: AgentTablesQueryConfiguration,
        required: true,
        include: [
          {
            model: AgentConfiguration,
            required: true,
            where: {
              status: "active",
            },
          },
        ],
      },
    ],
  });

  const tablesQueryConfigIds = removeNulls(
    tableConfigurations.map((config) => config.tablesQueryConfigurationId)
  );

  if (tablesQueryConfigIds.length === 0) {
    return "";
  }

  const tablesQueryConfigs = await AgentTablesQueryConfiguration.findAll({
    where: {
      id: { [Op.in]: tablesQueryConfigIds },
      workspaceId: workspace.id,
    },
  });

  logger.info(
    `Found ${tablesQueryConfigs.length} tables query configurations to migrate.`
  );

  // Create the MCP server views in system and global spaces.
  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "query_tables_v2"
    );
  if (!mcpServerView) {
    throw new Error("Tables Query MCP server view not found.");
  }

  let revertSql = "";

  // Replace each agent_tables_query_configuration with an MCP server configuration
  // and link the corresponding agent_tables_query_configuration_tables to the MCP server configuration.
  await concurrentExecutor(
    tablesQueryConfigs,
    async (tablesQueryConfig) => {
      const tables = tableConfigurations.filter(
        (table) => table.tablesQueryConfigurationId === tablesQueryConfig.id
      );

      if (execute) {
        // Create the MCP server configuration.
        const mcpConfig = await AgentMCPServerConfiguration.create({
          sId: generateRandomModelSId(),
          agentConfigurationId: tablesQueryConfig.agentConfigurationId,
          workspaceId: workspace.id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.internalMCPServerId,
          additionalConfiguration: {},
          timeFrame: null,
          name: tablesQueryConfig.name,
          singleToolDescriptionOverride: tablesQueryConfig.description,
          appId: null,
        });

        // Reverse: create the tables query configuration.
        revertSql +=
          `INSERT INTO "agent_tables_query_configurations" ` +
          `("id", "agentConfigurationId", "workspaceId", "name", "description", "createdAt", "updatedAt") ` +
          `VALUES ('${tablesQueryConfig.id}', '${tablesQueryConfig.agentConfigurationId}', ` +
          `'${tablesQueryConfig.workspaceId}', '${tablesQueryConfig.name}', '${tablesQueryConfig.description}', ` +
          `'${format(tablesQueryConfig.createdAt, "yyyy-MM-dd")}', ` +
          `'${format(tablesQueryConfig.updatedAt, "yyyy-MM-dd")}');\n`;

        // Update the tables query configuration tables to link to the new MCP server configuration.
        for (const table of tables) {
          // Reverse: link to the tables query configuration instead of the MCP server configuration.
          revertSql +=
            `UPDATE "agent_tables_query_configuration_tables" ` +
            `SET "tablesQueryConfigurationId" = '${tablesQueryConfig.id}', "mcpServerConfigurationId" = NULL ` +
            `WHERE "id" = '${table.id}';\n`;

          await table.update({
            mcpServerConfigurationId: mcpConfig.id,
            tablesQueryConfigurationId: null,
          });
        }

        // Delete the tables query configuration.
        await tablesQueryConfig.destroy();

        // Reverse: delete the MCP server configuration.
        revertSql += `DELETE FROM "agent_mcp_server_configurations" WHERE "id" = '${mcpConfig.id}';\n`;

        logger.info(
          {
            tablesQueryConfigurationId: tablesQueryConfig.id,
            mcpServerConfigurationId: mcpConfig.id,
            agentConfigurationId: tablesQueryConfig.agentConfigurationId,
            tablesCount: tables.length,
          },
          `Migrated tables query config to MCP server config.`
        );
      } else {
        logger.info(
          {
            tablesQueryConfigurationId: tablesQueryConfig.id,
            agentConfigurationId: tablesQueryConfig.agentConfigurationId,
            tablesCount: tables.length,
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

    if (execute && revertSql) {
      const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      fs.writeFileSync(`${now}_tables_query_to_mcp_revert.sql`, revertSql);
    }
  }
);
