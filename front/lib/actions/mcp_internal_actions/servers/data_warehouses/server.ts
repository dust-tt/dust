import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  getAvailableWarehouses,
  getWarehouseNodes,
  makeBrowseResource,
} from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses/helpers";
import { getAgentDataSourceConfigurations } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const TABLES_FILESYSTEM_TOOL_NAME = "tables_filesystem_navigation";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "data_warehouses",
  version: "1.0.0",
  description:
    "Comprehensive tables navigation toolkit for browsing data warehouses and tables. Provides Unix-like " +
    "browsing (ls, find) to help agents efficiently explore and discover tables organized in a " +
    "warehouse-centric hierarchy. Each warehouse contains schemas/databases which contain tables.",
  authorization: null,
  icon: "ActionTableIcon",
  documentationUrl: null,
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "list",
    "List the direct contents of a warehouse, database, or schema. Can be used to see what is inside a " +
      "specific location in the tables hierarchy, like 'ls' in Unix. If no nodeId is provided, lists " +
      "all available data warehouses at the root level. Hierarchy supports: warehouse → database → schema → " +
      "nested schemas → tables. Schemas can be arbitrarily nested within other schemas. Results are paginated " +
      "with a default limit and you can fetch additional pages using the nextPageCursor.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE
        ],
      nodeId: z
        .string()
        .nullable()
        .describe(
          "The ID of the warehouse, database, or schema to list contents of. " +
            "If not provided, lists all available data warehouses at the root."
        ),
      limit: z
        .number()
        .optional()
        .describe(
          `Maximum number of results to return. Default is ${DEFAULT_LIMIT}, max is ${MAX_LIMIT}.`
        ),
      nextPageCursor: z
        .string()
        .optional()
        .describe(
          "Cursor for fetching the next page of results. Use the 'nextPageCursor' from " +
            "the previous list result to fetch additional items."
        ),
    },
    withToolLogging(
      auth,
      { toolName: TABLES_FILESYSTEM_TOOL_NAME, agentLoopContext },
      async ({ nodeId, limit, nextPageCursor, dataSources }) => {
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
          return new Err(new MCPError(result.error.message));
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
    "find",
    "Find tables, schemas and databases based on their name starting from a specific node in the tables hierarchy. " +
      "Can be used to search for tables by name across warehouses, databases, and schemas. " +
      "The query supports partial matching - for example, searching for 'sales' will find " +
      "'sales_2024', 'monthly_sales_report', etc. This is like using 'find' in Unix for tables.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE
        ],
      query: z
        .string()
        .optional()
        .describe(
          "The table name to search for. This supports partial matching and does not require the " +
            "exact name. For example, searching for 'revenue' will find 'revenue_2024', " +
            "'monthly_revenue', 'revenue_by_region', etc. If omitted, lists all tables."
        ),
      rootNodeId: z
        .string()
        .optional()
        .describe(
          "The node ID to start the search from (warehouse, database, or schema ID). " +
            "If not provided, searches across all available warehouses. This restricts the " +
            "search to the specified node and all its descendants."
        ),
      limit: z
        .number()
        .optional()
        .describe(
          `Maximum number of results to return. Default is ${DEFAULT_LIMIT}, max is ${MAX_LIMIT}.`
        ),
      nextPageCursor: z
        .string()
        .optional()
        .describe(
          "Cursor for fetching the next page of results. Use the 'nextPageCursor' from " +
            "the previous find result to fetch additional items."
        ),
    },
    withToolLogging(
      auth,
      { toolName: TABLES_FILESYSTEM_TOOL_NAME, agentLoopContext },
      async (args) => {
        void args;
        throw new Error("Not implemented");
      }
    )
  );

  server.tool(
    "describe_tables",
    "Get detailed schema information for one or more tables. Provides DBML schema definitions, " +
      "SQL dialect-specific query guidelines, and example rows. All tables must be from the same " +
      "warehouse - cross-warehouse schema requests are not supported. Use this to understand table " +
      "structure before writing queries.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE
        ],
      tableIds: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of table identifiers in the format 'table-<dataSourceSId>-<nodeId>'. " +
            "All tables must be from the same warehouse (same dataSourceSId)."
        ),
    },
    withToolLogging(
      auth,
      { toolName: TABLES_FILESYSTEM_TOOL_NAME, agentLoopContext },
      async (args) => {
        void args;
        throw new Error("Not implemented");
      }
    )
  );

  server.tool(
    "query",
    "Execute SQL queries on tables from the same warehouse. You MUST call describe_tables at least once " +
      "before attempting to query tables to understand their structure. The query must respect the SQL dialect " +
      "and guidelines provided by describe_tables. All tables in a single query must be from the same warehouse.",
    {
      dataSources: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE
      ]
        .optional()
        .describe(
          "The data sources configured for this tool. This determines which warehouses and content nodes the tool can access."
        ),
      tableIds: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of table identifiers in the format 'table-<dataSourceSId>-<nodeId>'. " +
            "All tables must be from the same warehouse (same dataSourceSId)."
        ),
      query: z
        .string()
        .describe(
          "The SQL query to execute. Must respect the SQL dialect and guidelines provided by describe_tables."
        ),
      fileName: z
        .string()
        .describe("The name of the file to save the results to."),
    },
    withToolLogging(
      auth,
      { toolName: TABLES_FILESYSTEM_TOOL_NAME, agentLoopContext },
      async (args) => {
        void args;
        throw new Error("Not implemented");
      }
    )
  );

  return server;
};

export default createServer;
