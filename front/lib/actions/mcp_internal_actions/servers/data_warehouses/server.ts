import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  EXECUTE_TABLES_QUERY_MARKER,
  GET_DATABASE_SCHEMA_MARKER,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getAvailableWarehouses,
  getWarehouseNodes,
  makeBrowseResource,
} from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses/helpers";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import {
  getSectionColumnsPrefix,
  TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server";
import { getAgentDataSourceConfigurations } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { CSVRecord } from "@app/lib/api/csv";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { CoreAPI, Err, Ok } from "@app/types";

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
      async ({ query, rootNodeId, limit, nextPageCursor, dataSources }) => {
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
      async ({ tableIds }) => {
        // Parse table identifiers and validate they're all from the same warehouse
        const parsedTables: Array<{
          dataSourceSId: string;
          nodeId: string;
        }> = [];

        for (const tableId of tableIds) {
          if (!tableId.startsWith("table-")) {
            return new Ok([
              {
                type: "text" as const,
                text: `Invalid table identifier format: ${tableId}. Expected format: table-<dataSourceSId>-<nodeId>`,
              },
            ]);
          }

          const parts = tableId.split("-");
          if (parts.length < 3) {
            return new Ok([
              {
                type: "text" as const,
                text: `Invalid table identifier format: ${tableId}. Expected format: table-<dataSourceSId>-<nodeId>`,
              },
            ]);
          }

          const dataSourceSId = parts[1];
          const nodeId = parts.slice(2).join("-");

          parsedTables.push({ dataSourceSId, nodeId });
        }

        // Check all tables are from the same warehouse
        const uniqueDataSources = new Set(
          parsedTables.map((t) => t.dataSourceSId)
        );
        if (uniqueDataSources.size > 1) {
          return new Ok([
            {
              type: "text" as const,
              text: `All tables must be from the same warehouse. Found tables from ${uniqueDataSources.size} different warehouses: ${Array.from(uniqueDataSources).join(", ")}`,
            },
          ]);
        }

        const dataSourceSId = parsedTables[0].dataSourceSId;

        // Find the data source view
        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
        const dataSourceViews = await DataSourceViewResource.listBySpace(
          auth,
          globalSpace
        );

        const dataSourceView = dataSourceViews.find(
          (dsView) =>
            dsView.dataSource.sId === dataSourceSId &&
            isRemoteDatabase(dsView.dataSource)
        );

        if (!dataSourceView) {
          return new Ok([
            {
              type: "text" as const,
              text: `Data source not found or is not a remote database: ${dataSourceSId}`,
            },
          ]);
        }

        // Prepare tables for Core API call
        const coreAPITables = parsedTables.map((t) => ({
          project_id: parseInt(dataSourceView.dataSource.dustAPIProjectId),
          data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
          table_id: t.nodeId,
        }));

        // Call Core API's getDatabaseSchema endpoint
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const schemaResult = await coreAPI.getDatabaseSchema({
          tables: coreAPITables,
        });

        if (schemaResult.isErr()) {
          logger.error(
            {
              error: schemaResult.error,
              dataSourceSId,
              tableIds,
            },
            "Error retrieving database schema from Core API"
          );
          return new Ok([
            {
              type: "text" as const,
              text: `Error retrieving database schema: ${schemaResult.error.message}`,
            },
          ]);
        }

        // Format the response with schema content and query guidelines
        // Use the same format as tables_query_v2 to ensure proper UI rendering with syntax highlighting
        return new Ok([
          {
            type: "resource" as const,
            resource: {
              text: GET_DATABASE_SCHEMA_MARKER,
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
              uri: "",
            },
          },
          ...getSchemaContent(schemaResult.value.schemas),
          ...getQueryWritingInstructionsContent(schemaResult.value.dialect),
          ...getDatabaseExampleRowsContent(schemaResult.value.schemas),
        ]);
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
      async ({ tableIds, query, fileName }) => {
        if (!agentLoopContext?.runContext) {
          throw new Error("Unreachable: missing agentLoopContext.");
        }

        const agentLoopRunContext = agentLoopContext.runContext;

        // Parse table identifiers and validate they're all from the same warehouse
        const parsedTables: Array<{
          dataSourceSId: string;
          nodeId: string;
        }> = [];

        for (const tableId of tableIds) {
          if (!tableId.startsWith("table-")) {
            return new Err(
              new MCPError(
                `Invalid table identifier format: ${tableId}. Expected format: table-<dataSourceSId>-<nodeId>`,
                { tracked: false }
              )
            );
          }

          const parts = tableId.split("-");
          if (parts.length < 3) {
            return new Err(
              new MCPError(
                `Invalid table identifier format: ${tableId}. Expected format: table-<dataSourceSId>-<nodeId>`,
                { tracked: false }
              )
            );
          }

          const dataSourceSId = parts[1];
          const nodeId = parts.slice(2).join("-");

          parsedTables.push({ dataSourceSId, nodeId });
        }

        // Check all tables are from the same warehouse
        const uniqueDataSources = new Set(
          parsedTables.map((t) => t.dataSourceSId)
        );
        if (uniqueDataSources.size > 1) {
          return new Err(
            new MCPError(
              `All tables must be from the same warehouse. Found tables from ${uniqueDataSources.size} different warehouses: ${Array.from(uniqueDataSources).join(", ")}`,
              { tracked: false }
            )
          );
        }

        const dataSourceSId = parsedTables[0].dataSourceSId;

        // Find the data source view
        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
        const dataSourceViews = await DataSourceViewResource.listBySpace(
          auth,
          globalSpace
        );

        const dataSourceView = dataSourceViews.find(
          (dsView) =>
            dsView.dataSource.sId === dataSourceSId &&
            isRemoteDatabase(dsView.dataSource)
        );

        if (!dataSourceView) {
          return new Err(
            new MCPError(
              `Data source not found or is not a remote database: ${dataSourceSId}`,
              { tracked: false }
            )
          );
        }

        // Prepare tables for Core API call
        const coreAPITables = parsedTables.map((t) => ({
          project_id: parseInt(dataSourceView.dataSource.dustAPIProjectId),
          data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
          table_id: t.nodeId,
        }));

        // Call Core API's queryDatabase endpoint
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const queryResult = await coreAPI.queryDatabase({
          tables: coreAPITables,
          query,
        });

        if (queryResult.isErr()) {
          return new Err(
            new MCPError(
              "Error executing database query: " + queryResult.error.message,
              { tracked: false }
            )
          );
        }

        const content: {
          type: "resource";
          resource: any;
        }[] = [];

        const results: CSVRecord[] = queryResult.value.results
          .map((r) => r.value)
          .filter(
            (record) =>
              record !== undefined &&
              record !== null &&
              typeof record === "object"
          );

        content.push({
          type: "resource",
          resource: {
            text: EXECUTE_TABLES_QUERY_MARKER,
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
            uri: "",
          },
        });

        if (results.length > 0) {
          // date in yyyy-mm-dd
          const humanReadableDate = new Date().toISOString().split("T")[0];
          const queryTitle = `${fileName} (${humanReadableDate})`;

          // Generate the CSV file
          const { csvFile, csvSnippet } = await generateCSVFileAndSnippet(
            auth,
            {
              title: queryTitle,
              conversationId: agentLoopRunContext.conversation.sId,
              results,
            }
          );

          // Upload the CSV file to the conversation data source
          await uploadFileToConversationDataSource({
            auth,
            file: csvFile,
          });

          // Append the CSV file to the output of the tool as an agent-generated file
          content.push({
            type: "resource",
            resource: {
              text: "Your query results were generated successfully. They are available as a structured CSV file.",
              uri: csvFile.getPublicUrl(auth),
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              fileId: csvFile.sId,
              title: queryTitle,
              contentType: csvFile.contentType,
              snippet: csvSnippet,
            },
          });

          // Check if we should generate a section JSON file
          const shouldGenerateSectionFile = results.some((result) =>
            Object.values(result).some(
              (value) =>
                typeof value === "string" &&
                value.length > TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH
            )
          );

          if (shouldGenerateSectionFile) {
            const connectorProvider =
              dataSourceView.dataSource.connectorProvider ?? null;
            const sectionColumnsPrefix =
              getSectionColumnsPrefix(connectorProvider);

            // Generate the section file
            const sectionFile = await generateSectionFile(auth, {
              title: queryTitle,
              conversationId: agentLoopRunContext.conversation.sId,
              results,
              sectionColumnsPrefix,
            });

            // Upload the section file to the conversation data source
            await uploadFileToConversationDataSource({
              auth,
              file: sectionFile,
            });

            // Append the section file to the output of the tool as an agent-generated file
            content.push({
              type: "resource",
              resource: {
                text: "Results are also available as a rich text file that can be searched.",
                uri: sectionFile.getPublicUrl(auth),
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
                fileId: sectionFile.sId,
                title: `${queryTitle} (Rich Text)`,
                contentType: sectionFile.contentType,
                snippet: null,
              },
            });
          }
        }

        return new Ok(content);
      }
    )
  );

  return server;
};

export default createServer;
