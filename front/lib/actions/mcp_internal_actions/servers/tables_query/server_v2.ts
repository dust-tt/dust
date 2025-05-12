import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import { fetchAgentTableConfigurations } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "query_tables_v2",
  version: "1.0.0",
  description:
    "Tables, Spreadsheets, Notion DBs (quantitative) (mcp, exploded).",
  icon: "ActionTableIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopRunContext?: AgentLoopRunContextType
): McpServer {
  void agentLoopRunContext;

  const server = new McpServer(serverInfo);

  server.tool(
    "get_database_schema",
    "Retrieves the database schema for the specified tables. You MUST call this tool at least once before attempting to query tables to understand their structure. This tool provides essential information about table columns, types, and relationships needed to write accurate SQL queries.",
    {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
    },
    async ({ tables }) => {
      // Fetch table configurations
      const agentTableConfigurationsRes = await fetchAgentTableConfigurations(
        auth,
        tables
      );
      if (agentTableConfigurationsRes.isErr()) {
        return makeMCPToolTextError(
          `Error fetching table configurations: ${agentTableConfigurationsRes.error.message}`
        );
      }
      const agentTableConfigurations = agentTableConfigurationsRes.value;
      if (agentTableConfigurations.length === 0) {
        return makeMCPToolTextError(
          "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool."
        );
      }
      const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
        auth,
        [...new Set(agentTableConfigurations.map((t) => t.dataSourceViewId))]
      );
      const dataSourceViewsMap = new Map(
        dataSourceViews.map((dsv) => [dsv.id, dsv])
      );

      // Format table identifiers for Core API call
      const configuredTables: Array<[number, string, string]> = [];
      for (const t of agentTableConfigurations) {
        const dataSourceView = dataSourceViewsMap.get(t.dataSourceViewId);
        if (!dataSourceView || !dataSourceView.dataSource.dustAPIDataSourceId) {
          throw new Error(
            `Missing data source ID for view ${t.dataSourceViewId}`
          );
        }

        configuredTables.push([
          parseInt(dataSourceView.dataSource.dustAPIProjectId, 10),
          dataSourceView.dataSource.dustAPIDataSourceId,
          t.tableId,
        ]);
      }

      // Call Core API's /database_schema endpoint
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const viewId = agentTableConfigurations[0].dataSourceViewId;
      const view = dataSourceViewsMap.get(viewId);
      if (!view) {
        throw new Error(
          `unreachable: Missing view ${viewId} for agent table configuration ${agentTableConfigurations[0].id}.`
        );
      }
      const viewFilter = view.toViewFilter();
      const schemaResult = await coreAPI.getDatabaseSchema({
        tables: configuredTables,
        filter: viewFilter,
      });

      if (schemaResult.isErr()) {
        return makeMCPToolTextError(
          `Error retrieving database schema: ${schemaResult.error.message}`
        );
      }

      return {
        isError: false,
        content: [
          ...getSchemaContent(schemaResult.value.schemas),
          ...getQueryWritingInstructionsContent(schemaResult.value.dialect),
          ...getDatabaseExampleRowsContent(schemaResult.value.schemas),
        ],
      };
    }
  );

  return server;
}

export default createServer;
