import { format } from "date-fns";
import fs from "fs";
import { Op } from "sequelize";

import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";
import { removeNulls } from "@app/types";

async function findWorkspacesWithTablesConfigurations(): Promise<ModelId[]> {
  const tableConfigurations = await AgentTablesQueryConfigurationTable.findAll({
    attributes: ["workspaceId"],
    where: {
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

  return tableConfigurations.map((config) => config.workspaceId);
}

/**
 * Migrates tables query actions from non-MCP to MCP version for a specific workspace.
 */
async function migrateWorkspaceTablesQueryActions(
  auth: Authenticator,
  {
    execute,
    parentLogger,
  }: {
    execute: boolean;
    parentLogger: typeof Logger;
  }
): Promise<string> {
  const owner = auth.getNonNullableWorkspace();
  const logger = parentLogger.child({
    workspaceId: owner.sId,
  });

  logger.info("Starting migration of tables query actions to MCP.");

  // Find all existing tables query configurations that are linked to an active agent configuration
  // First, get all the unique tablesQueryConfigurationIds that need migration
  const tableConfigurations = await AgentTablesQueryConfigurationTable.findAll({
    where: {
      workspaceId: owner.id,
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
      workspaceId: owner.id,
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
      "query_tables"
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
          workspaceId: owner.id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.internalMCPServerId,
          additionalConfiguration: {},
          timeFrame: null,
          name:
            tablesQueryConfig.name === DEFAULT_TABLES_QUERY_ACTION_NAME
              ? null
              : tablesQueryConfig.name,
          singleToolDescriptionOverride: tablesQueryConfig.description,
          appId: null,
        });

        // Reverse: create the tables query configuration.
        revertSql +=
          `INSERT INTO "agent_tables_query_configurations" ` +
          `("id", "sId", "agentConfigurationId", "workspaceId", "name", "description", "createdAt", "updatedAt") ` +
          `VALUES ('${tablesQueryConfig.id}', '${tablesQueryConfig.sId}', '${tablesQueryConfig.agentConfigurationId}', ` +
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
    startFromWorkspaceId: {
      type: "number",
      description: "Workspace ID to start from",
      required: false,
    },
  },
  async ({ execute, startFromWorkspaceId }, parentLogger) => {
    const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    let revertSql = "";

    const workspaceIds = await findWorkspacesWithTablesConfigurations();
    const workspaces = await Workspace.findAll({
      where: {
        id: { [Op.in]: workspaceIds },
        ...(startFromWorkspaceId
          ? { id: { [Op.gte]: startFromWorkspaceId } }
          : {}),
      },
      order: [["id", "ASC"]],
    });

    for (const workspace of workspaces) {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const workspaceRevertSql = await migrateWorkspaceTablesQueryActions(
        auth,
        {
          execute,
          parentLogger,
        }
      );

      if (execute) {
        fs.writeFileSync(
          `${now}_tables_query_to_mcp_revert_${workspace.sId}.sql`,
          workspaceRevertSql
        );
      }
      revertSql += workspaceRevertSql;
    }

    if (execute) {
      fs.writeFileSync(`${now}_tables_query_to_mcp_revert_all.sql`, revertSql);
    }
  }
);
