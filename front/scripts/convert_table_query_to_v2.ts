import fs from "fs";

import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const CONFIGURATION_CONCURRENCY = 10;

/**
 * Converts all table query tools from query_tables to query_tables_v2 for a specific workspace.
 * This requires the workspace to have the "exploded_tables_query" feature flag enabled.
 */
async function convertWorkspaceTableQueryToolsToV2({
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

  logger.info("Starting conversion of table query tools to v2.");

  // Get admin auth for the workspace
  const auth = await Authenticator.internalAdminForWorkspace(wId);
  const workspace = auth.getNonNullableWorkspace();

  // Find the query_tables MCP server view
  const queryTablesMCPServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "query_tables"
    );

  if (!queryTablesMCPServerView) {
    logger.info("No query_tables MCP server view found - nothing to convert.");
    return "";
  }

  logger.info(
    {
      mcpServerViewId: queryTablesMCPServerView.id,
      internalMCPServerId: queryTablesMCPServerView.internalMCPServerId,
    },
    `Found query_tables MCP server view.`
  );

  // Find all configurations using this query_tables server view
  const tableQueryConfigs = await AgentMCPServerConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      mcpServerViewId: queryTablesMCPServerView.id,
    },
    include: [
      {
        model: AgentConfiguration,
        required: true,
        where: {
          status: "active",
        },
      },
    ],
  });

  logger.info(
    `Found ${tableQueryConfigs.length} table query configurations to convert to v2.`
  );

  if (tableQueryConfigs.length === 0) {
    return "";
  }

  // Ensure all auto tools are created
  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  // Get the v2 MCP server view
  const mcpServerViewV2 =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "query_tables_v2"
    );

  if (!mcpServerViewV2) {
    throw new Error(
      "Tables Query V2 MCP server view not found. Ensure the workspace has the 'exploded_tables_query' feature flag enabled."
    );
  }

  let revertSql = "";

  // Convert each configuration from query_tables to query_tables_v2
  await concurrentExecutor(
    tableQueryConfigs,
    async (config) => {
      if (execute) {
        // Store original values for revert
        const originalMcpServerViewId = config.mcpServerViewId;
        const originalInternalMCPServerId = config.internalMCPServerId;

        // Update to use query_tables_v2
        await config.update({
          mcpServerViewId: mcpServerViewV2.id,
          internalMCPServerId: mcpServerViewV2.internalMCPServerId,
        });

        // Generate revert SQL
        revertSql +=
          `UPDATE "agent_mcp_server_configurations" ` +
          `SET "mcpServerViewId" = '${originalMcpServerViewId}', ` +
          `"internalMCPServerId" = '${originalInternalMCPServerId}' ` +
          `WHERE "id" = '${config.id}';\n`;

        logger.info(
          {
            mcpServerConfigurationId: config.id,
            agentConfigurationId: config.agentConfigurationId,
          },
          `Converted table query config from v1 to v2.`
        );
      } else {
        logger.info(
          {
            mcpServerConfigurationId: config.id,
            agentConfigurationId: config.agentConfigurationId,
          },
          `Would convert table query config from v1 to v2.`
        );
      }
    },
    { concurrency: CONFIGURATION_CONCURRENCY }
  );

  if (execute) {
    logger.info(
      `Successfully converted ${tableQueryConfigs.length} table query configurations to v2.`
    );
  } else {
    logger.info(
      `Would have converted ${tableQueryConfigs.length} table query configurations to v2.`
    );
  }

  return revertSql;
}

makeScript(
  {
    wId: {
      type: "string",
      description: "Workspace ID to convert",
      required: true,
    },
  },
  async ({ execute, wId }, parentLogger) => {
    const revertSql = await convertWorkspaceTableQueryToolsToV2({
      wId,
      execute,
      parentLogger,
    });

    if (execute && revertSql) {
      const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      fs.writeFileSync(
        `${now}_table_query_v1_to_v2_revert_${wId}.sql`,
        revertSql
      );
      console.log(
        `Revert SQL written to ${now}_table_query_v1_to_v2_revert_${wId}.sql`
      );
    }
  }
);
