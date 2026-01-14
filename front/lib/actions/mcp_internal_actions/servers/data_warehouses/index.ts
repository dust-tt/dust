import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getAvailableWarehouses,
  getWarehouseNodes,
  makeBrowseResource,
  validateTables,
} from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses/helpers";
import {
  DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME,
  DATA_WAREHOUSES_FIND_TOOL_NAME,
  DATA_WAREHOUSES_LIST_TOOL_NAME,
  DATA_WAREHOUSES_QUERY_TOOL_NAME,
  DATA_WAREHOUSES_TOOL_NAME,
  describeTablesSchema,
  findSchema,
  listSchema,
  querySchema,
} from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses/metadata";
import { executeQuery } from "@app/lib/actions/mcp_internal_actions/servers/tables_query";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import { getAgentDataSourceConfigurations } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { ensureAuthorizedDataSourceViews } from "@app/lib/actions/mcp_internal_actions/utils/data_source_views";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI, Err, Ok } from "@app/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("data_warehouses");

  server.tool(
    DATA_WAREHOUSES_LIST_TOOL_NAME,
    "List the direct contents of a warehouse, database, or schema. Can be used to see what is inside a " +
      "specific location in the tables hierarchy, like 'ls' in Unix. If no nodeId is provided, lists " +
      "all available data warehouses at the root level. Hierarchy supports: warehouse → database → schema → " +
      "nested schemas → tables. Schemas can be arbitrarily nested within other schemas. Results are paginated " +
      "with a default limit and you can fetch additional pages using the nextPageCursor.",
    listSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: DATA_WAREHOUSES_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ nodeId, limit, nextPageCursor, dataSources }) => {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

        const dataSourceConfigurationsResult =
          await getAgentDataSourceConfigurations(
            auth,
            dataSources.map((ds) => ({
              ...ds,
              mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
            }))
          );

        if (dataSourceConfigurationsResult.isErr()) {
          return new Err(
            new MCPError(dataSourceConfigurationsResult.error.message)
          );
        }

        const agentDataSourceConfigurations =
          dataSourceConfigurationsResult.value;

        const authRes = await ensureAuthorizedDataSourceViews(
          auth,
          agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
        );
        if (authRes.isErr()) {
          return new Err(authRes.error);
        }

        const result =
          nodeId === null
            ? await getAvailableWarehouses(
                auth,
                agentDataSourceConfigurations,
                {
                  limit: effectiveLimit,
                  nextPageCursor,
                }
              )
            : await getWarehouseNodes(auth, agentDataSourceConfigurations, {
                nodeId,
                limit: effectiveLimit,
                nextPageCursor,
              });

        if (result.isErr()) {
          return new Err(result.error);
        }

        const { nodes, nextPageCursor: newCursor } = result.value;

        return new Ok([
          {
            type: "resource" as const,
            resource: makeBrowseResource({
              nodeId,
              nodes,
              nextPageCursor: newCursor,
              resultCount: dataSources.length,
            }),
          },
        ]);
      }
    )
  );

  server.tool(
    DATA_WAREHOUSES_FIND_TOOL_NAME,
    "Find tables, schemas and databases based on their name starting from a specific node in the tables hierarchy. " +
      "Can be used to search for tables by name across warehouses, databases, and schemas. " +
      "The query supports partial matching - for example, searching for 'sales' will find " +
      "'sales_2024', 'monthly_sales_report', etc. This is like using 'find' in Unix for tables.",
    findSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: DATA_WAREHOUSES_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ query, rootNodeId, limit, nextPageCursor, dataSources }) => {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

        const dataSourceConfigurationsResult =
          await getAgentDataSourceConfigurations(
            auth,
            dataSources.map((ds) => ({
              ...ds,
              mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
            }))
          );

        if (dataSourceConfigurationsResult.isErr()) {
          return new Err(
            new MCPError(dataSourceConfigurationsResult.error.message)
          );
        }

        const agentDataSourceConfigurations =
          dataSourceConfigurationsResult.value;

        const authRes = await ensureAuthorizedDataSourceViews(
          auth,
          agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
        );
        if (authRes.isErr()) {
          return new Err(authRes.error);
        }

        const result = await getWarehouseNodes(
          auth,
          agentDataSourceConfigurations,
          {
            nodeId: rootNodeId ?? null,
            query,
            limit: effectiveLimit,
            nextPageCursor,
          }
        );

        if (result.isErr()) {
          return new Err(new MCPError(result.error.message));
        }

        const { nodes, nextPageCursor: newCursor } = result.value;

        return new Ok([
          {
            type: "resource" as const,
            resource: makeBrowseResource({
              nodeId: rootNodeId ?? null,
              nodes,
              nextPageCursor: newCursor,
              resultCount: dataSources.length,
            }),
          },
        ]);
      }
    )
  );

  server.tool(
    DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME,
    "Get detailed schema information for one or more tables. Provides DBML schema definitions, " +
      "SQL dialect-specific query guidelines, and example rows. All tables must be from the same " +
      "warehouse - cross-warehouse schema requests are not supported. Use this to understand table " +
      "structure before writing queries.",
    describeTablesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: DATA_WAREHOUSES_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ dataSources, tableIds }) => {
        const dataSourceConfigurationsResult =
          await getAgentDataSourceConfigurations(
            auth,
            dataSources.map((ds) => ({
              ...ds,
              mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
            }))
          );

        if (dataSourceConfigurationsResult.isErr()) {
          return new Err(
            new MCPError(dataSourceConfigurationsResult.error.message)
          );
        }

        const agentDataSourceConfigurations =
          dataSourceConfigurationsResult.value;

        const authRes = await ensureAuthorizedDataSourceViews(
          auth,
          agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
        );
        if (authRes.isErr()) {
          return new Err(authRes.error);
        }

        const validationResult = await validateTables(
          auth,
          tableIds,
          agentDataSourceConfigurations
        );

        if (validationResult.isErr()) {
          return validationResult;
        }

        const { validatedNodes, dataSourceId } = validationResult.value;

        const dataSource = await DataSourceResource.fetchById(
          auth,
          dataSourceId
        );

        if (!dataSource) {
          return new Err(
            new MCPError("Data source not found", {
              tracked: false,
            })
          );
        }

        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const schemaResult = await coreAPI.getDatabaseSchema({
          tables: validatedNodes.map((node) => ({
            project_id: parseInt(dataSource.dustAPIProjectId, 10),
            data_source_id: dataSource.dustAPIDataSourceId,
            table_id: node.node_id,
          })),
        });

        if (schemaResult.isErr()) {
          return new Err(
            new MCPError(
              `Error retrieving database schema: ${schemaResult.error.message}`
            )
          );
        }

        return new Ok([
          ...getSchemaContent(schemaResult.value.schemas),
          ...getQueryWritingInstructionsContent(schemaResult.value.dialect),
          ...getDatabaseExampleRowsContent(schemaResult.value.schemas),
        ]);
      }
    )
  );

  server.tool(
    DATA_WAREHOUSES_QUERY_TOOL_NAME,
    "Execute SQL queries on tables from the same warehouse. You MUST call describe_tables at least once " +
      "before attempting to query tables to understand their structure. The query must respect the SQL dialect " +
      `and guidelines provided by ${DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME}. All tables in a single query must be from the same warehouse.`,
    querySchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: DATA_WAREHOUSES_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ dataSources, tableIds, query, fileName }) => {
        if (!agentLoopContext?.runContext) {
          return new Err(
            new MCPError("Missing agentLoopContext for file generation")
          );
        }

        const agentLoopRunContext = agentLoopContext.runContext;

        const dataSourceConfigurationsResult =
          await getAgentDataSourceConfigurations(
            auth,
            dataSources.map((ds) => ({
              ...ds,
              mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
            }))
          );

        if (dataSourceConfigurationsResult.isErr()) {
          return new Err(
            new MCPError(dataSourceConfigurationsResult.error.message)
          );
        }

        const agentDataSourceConfigurations =
          dataSourceConfigurationsResult.value;

        const authRes = await ensureAuthorizedDataSourceViews(
          auth,
          agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
        );
        if (authRes.isErr()) {
          return new Err(authRes.error);
        }

        const validationResult = await validateTables(
          auth,
          tableIds,
          agentDataSourceConfigurations
        );

        if (validationResult.isErr()) {
          return validationResult;
        }

        const { validatedNodes, dataSourceId } = validationResult.value;

        const dataSource = await DataSourceResource.fetchById(
          auth,
          dataSourceId
        );

        if (!dataSource) {
          return new Err(
            new MCPError("Data source not found", {
              tracked: false,
            })
          );
        }

        const connectorProvider = dataSource.connectorProvider;

        return executeQuery(auth, {
          tables: validatedNodes.map((node) => ({
            project_id: parseInt(dataSource.dustAPIProjectId, 10),
            data_source_id: dataSource.dustAPIDataSourceId,
            table_id: node.node_id,
          })),
          query,
          conversationId: agentLoopRunContext.conversation.sId,
          fileName,
          connectorProvider,
        });
      }
    )
  );

  return server;
}

export default createServer;
