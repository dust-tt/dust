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
import { renderNode } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import {
  getSectionColumnsPrefix,
  TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server";
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
import type { ConnectorProvider, CoreAPIContentNode } from "@app/types";
import { CoreAPI, Err, Ok } from "@app/types";

const TABLES_FILESYSTEM_TOOL_NAME = "tables_filesystem_navigation";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "tables_filesystem",
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
      dataSources: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE
      ]
        .optional()
        .describe(
          "The data sources configured for this tool. This determines which warehouses and content nodes the tool can access."
        ),
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
      async ({ nodeId, limit, nextPageCursor }) => {
        const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

        // When nodeId is null, list all warehouses at the root level
        if (nodeId === null) {
          // List all remote databases in the global space
          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);

          // Get all data source views in the global space
          const dataSourceViews = await DataSourceViewResource.listBySpace(
            auth,
            globalSpace
          );

          // Filter to only remote databases
          const remoteDatabaseViews = dataSourceViews.filter((dsView) =>
            isRemoteDatabase(dsView.dataSource)
          );

          // Sort by most recent first
          remoteDatabaseViews.sort(
            (a, b) =>
              b.dataSource.editedAt.getTime() - a.dataSource.editedAt.getTime()
          );

          // Apply pagination
          const offset = nextPageCursor ? parseInt(nextPageCursor, 10) || 0 : 0;
          const limitedDatabaseViews = remoteDatabaseViews.slice(
            offset,
            offset + effectiveLimit
          );

          const hasMore = offset + effectiveLimit < remoteDatabaseViews.length;
          const newCursor = hasMore ? String(offset + effectiveLimit) : null;

          // Create a map for connector providers
          const dataSourceIdToConnectorMap = new Map<
            string,
            ConnectorProvider | null
          >();

          // Format the response - convert warehouses to node-like format
          const data = limitedDatabaseViews.map((dsView) => {
            // Create a pseudo-node for the warehouse
            const pseudoNode: CoreAPIContentNode = {
              data_source_id: dsView.dataSource.dustAPIDataSourceId,
              data_source_internal_id: dsView.dataSource.id.toString(),
              node_id: `warehouse-${dsView.dataSource.sId}`,
              node_type: "folder",
              timestamp: dsView.dataSource.editedAt.getTime(),
              title: dsView.dataSource.name,
              mime_type: "application/vnd.dust.warehouse",
              provider_visibility: null,
              parent_id: null,
              parents: [],
              source_url: null,
              children_count: 1, // Warehouses always have children
              parent_title: null,
            };

            // Add to connector map
            dataSourceIdToConnectorMap.set(
              dsView.dataSource.dustAPIDataSourceId,
              dsView.dataSource.connectorProvider
            );

            return renderNode(pseudoNode, dataSourceIdToConnectorMap);
          });

          return new Ok([
            {
              type: "resource" as const,
              resource: {
                mimeType:
                  "application/vnd.dust.tool-output.tables-filesystem-browse",
                uri: "",
                text: `Found ${remoteDatabaseViews.length} remote database${remoteDatabaseViews.length !== 1 ? "s" : ""} in the global space. Showing ${limitedDatabaseViews.length} result${limitedDatabaseViews.length !== 1 ? "s" : ""}.${hasMore ? " More results available." : ""}`,
                nodeId: null, // Root level browsing
                data,
                nextPageCursor: newCursor,
                resultCount: limitedDatabaseViews.length,
              },
            },
          ]);
        }

        // Handle listing contents of a specific warehouse
        if (nodeId.startsWith("warehouse-")) {
          const dataSourceSId = nodeId.substring("warehouse-".length);

          // Find the data source view from our list
          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);
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

          // Use Core API to fetch database nodes (top-level folders in the data source)
          const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

          const coreRes = await coreAPI.searchNodes({
            filter: {
              data_source_views: [
                {
                  data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
                  view_filter: [],
                },
              ],
              parent_id: "root",
              node_types: ["folder"],
            },
            options: {
              cursor: nextPageCursor,
              limit: effectiveLimit,
              // Always sort by timestamp descending (most recent first)
              sort: [{ field: "timestamp", direction: "desc" as const }],
            },
          });

          if (coreRes.isErr()) {
            logger.error(
              {
                error: coreRes.error,
                dataSourceSId,
                limit: effectiveLimit,
              },
              "Error fetching databases from Core API"
            );
            return new Ok([
              {
                type: "text" as const,
                text: `Error fetching databases: ${coreRes.error.message}`,
              },
            ]);
          }

          // Filter to only database nodes (not schemas at this level)
          const databaseNodes = coreRes.value.nodes.filter((node) => {
            // Check if this is a database node based on mime type
            // At the root level of a warehouse, we expect databases
            const mimeType = node.mime_type.toLowerCase();
            return mimeType.includes("database");
          });

          // Create connector map
          const dataSourceIdToConnectorMap = new Map<
            string,
            ConnectorProvider | null
          >();
          dataSourceIdToConnectorMap.set(
            dataSourceView.dataSource.dustAPIDataSourceId,
            dataSourceView.dataSource.connectorProvider
          );

          // Format the response using renderNode
          const data = databaseNodes.map((node) => {
            // Override the node_id to include the datasource prefix
            const modifiedNode = {
              ...node,
              node_id: `database-${dataSourceView.dataSource.sId}-${node.node_id}`,
            };
            return renderNode(modifiedNode, dataSourceIdToConnectorMap);
          });

          const hasMore = coreRes.value.next_page_cursor !== null;

          return new Ok([
            {
              type: "resource" as const,
              resource: {
                mimeType:
                  "application/vnd.dust.tool-output.tables-filesystem-browse",
                uri: "",
                text: `Found ${databaseNodes.length} database${databaseNodes.length !== 1 ? "s" : ""} in ${dataSourceView.dataSource.name}.${hasMore ? " More results available." : ""}`,
                nodeId: nodeId, // Show which warehouse was browsed
                data,
                nextPageCursor: coreRes.value.next_page_cursor,
                resultCount: databaseNodes.length,
              },
            },
          ]);
        }

        // Handle listing contents of a database or schema
        if (nodeId.startsWith("database-") || nodeId.startsWith("schema-")) {
          const parts = nodeId.split("-");
          const nodeType = parts[0]; // "database" or "schema"
          const dataSourceSId = parts[1];
          const parentNodeId = parts.slice(2).join("-"); // The node ID within the data source

          // Find the data source view from our list
          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);
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

          // Use Core API to fetch child nodes
          const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

          const coreRes = await coreAPI.searchNodes({
            filter: {
              data_source_views: [
                {
                  data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
                  view_filter: [],
                },
              ],
              parent_id: parentNodeId,
              node_types: ["folder", "table"], // Include both folders (schemas) and tables
            },
            options: {
              cursor: nextPageCursor,
              limit: effectiveLimit,
              // Always sort by timestamp descending (most recent first)
              sort: [{ field: "timestamp", direction: "desc" as const }],
            },
          });

          if (coreRes.isErr()) {
            logger.error(
              {
                error: coreRes.error,
                dataSourceSId,
                parentNodeId,
                nodeType,
                limit: effectiveLimit,
              },
              "Error fetching child nodes from Core API"
            );
            return new Ok([
              {
                type: "text" as const,
                text: `Error fetching contents: ${coreRes.error.message}`,
              },
            ]);
          }

          // Create connector map
          const dataSourceIdToConnectorMap = new Map<
            string,
            ConnectorProvider | null
          >();
          dataSourceIdToConnectorMap.set(
            dataSourceView.dataSource.dustAPIDataSourceId,
            dataSourceView.dataSource.connectorProvider
          );

          // Format the response
          const data = coreRes.value.nodes.map((node) => {
            // Determine the type prefix based on the node type and mime type
            let nodeIdPrefix = "table";
            if (node.node_type === "folder") {
              // Check if it's a schema based on mime type
              const mimeType = node.mime_type.toLowerCase();
              nodeIdPrefix = mimeType.includes("schema") ? "schema" : "folder";
            }

            // Override the node_id to include the prefix
            const modifiedNode = {
              ...node,
              node_id: `${nodeIdPrefix}-${dataSourceView.dataSource.sId}-${node.node_id}`,
            };

            return renderNode(modifiedNode, dataSourceIdToConnectorMap);
          });

          const parentType = nodeType === "database" ? "database" : "schema";
          const hasMore = coreRes.value.next_page_cursor !== null;

          return new Ok([
            {
              type: "resource" as const,
              resource: {
                mimeType:
                  "application/vnd.dust.tool-output.tables-filesystem-browse",
                uri: "",
                text: `Found ${data.length} item${data.length !== 1 ? "s" : ""} in the ${parentType}.${hasMore ? " More results available." : ""}`,
                nodeId: nodeId, // Show which node was browsed
                data,
                nextPageCursor: coreRes.value.next_page_cursor,
                resultCount: data.length,
              },
            },
          ]);
        }

        // Unknown node type
        return new Ok([
          {
            type: "text" as const,
            text: `Unknown node type: ${nodeId}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "find",
    "Find tables based on their name starting from a specific node in the tables hierarchy. " +
      "Can be used to search for tables by name across warehouses, databases, and schemas. " +
      "The query supports partial matching - for example, searching for 'sales' will find " +
      "'sales_2024', 'monthly_sales_report', etc. This is like using 'find' in Unix for tables.",
    {
      dataSources: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE
      ]
        .optional()
        .describe(
          "The data sources configured for this tool. This determines which warehouses and content nodes the tool can access."
        ),
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
      async ({ query, rootNodeId, limit, nextPageCursor }) => {
        const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

        // Get all data source views in the global space
        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
        const dataSourceViews = await DataSourceViewResource.listBySpace(
          auth,
          globalSpace
        );

        // Filter to only remote databases
        const remoteDatabaseViews = dataSourceViews.filter((dsView) =>
          isRemoteDatabase(dsView.dataSource)
        );

        if (remoteDatabaseViews.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No remote databases found in the workspace.",
            },
          ]);
        }

        // Build data source view filters based on rootNodeId
        let dataSourceViewFilters: Array<{
          data_source_id: string;
          view_filter: string[];
        }> = [];

        if (!rootNodeId) {
          // Search across all remote databases
          dataSourceViewFilters = remoteDatabaseViews.map((dsView) => ({
            data_source_id: dsView.dataSource.dustAPIDataSourceId,
            view_filter: [],
          }));
        } else if (rootNodeId.startsWith("warehouse-")) {
          // Search within a specific warehouse
          const dataSourceSId = rootNodeId.substring("warehouse-".length);
          const dataSourceView = remoteDatabaseViews.find(
            (dsView) => dsView.dataSource.sId === dataSourceSId
          );

          if (!dataSourceView) {
            return new Ok([
              {
                type: "text" as const,
                text: `Warehouse not found: ${rootNodeId}`,
              },
            ]);
          }

          dataSourceViewFilters = [
            {
              data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
              view_filter: [],
            },
          ];
        } else if (
          rootNodeId.startsWith("database-") ||
          rootNodeId.startsWith("schema-")
        ) {
          // Search within a specific database or schema
          const parts = rootNodeId.split("-");
          const dataSourceSId = parts[1];
          const nodeId = parts.slice(2).join("-");

          const dataSourceView = remoteDatabaseViews.find(
            (dsView) => dsView.dataSource.sId === dataSourceSId
          );

          if (!dataSourceView) {
            return new Ok([
              {
                type: "text" as const,
                text: `Data source not found for node: ${rootNodeId}`,
              },
            ]);
          }

          // Use the node as a view filter to search within it
          dataSourceViewFilters = [
            {
              data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
              view_filter: [nodeId],
            },
          ];
        } else {
          return new Ok([
            {
              type: "text" as const,
              text: `Invalid node ID format: ${rootNodeId}`,
            },
          ]);
        }

        // Search for tables (and optionally schemas if no query)
        const nodeTypes = query ? ["table"] : ["folder", "table"];

        const searchResult = await coreAPI.searchNodes({
          query,
          filter: {
            data_source_views: dataSourceViewFilters,
            node_types: nodeTypes,
          },
          options: {
            cursor: nextPageCursor,
            limit: effectiveLimit,
            // Only add sort when there's no query (Core API restriction)
            sort: query
              ? undefined
              : [{ field: "timestamp", direction: "desc" as const }],
          },
        });

        if (searchResult.isErr()) {
          logger.error(
            {
              error: searchResult.error,
              query,
              rootNodeId,
              limit: effectiveLimit,
            },
            "Error searching for tables"
          );
          return new Ok([
            {
              type: "text" as const,
              text: `Error searching for tables: ${searchResult.error.message}`,
            },
          ]);
        }

        // Create connector map for rendering
        const dataSourceIdToConnectorMap = new Map<
          string,
          ConnectorProvider | null
        >();
        remoteDatabaseViews.forEach((dsView) => {
          dataSourceIdToConnectorMap.set(
            dsView.dataSource.dustAPIDataSourceId,
            dsView.dataSource.connectorProvider
          );
        });

        // Collect all unique parent IDs to fetch their titles in bulk
        const allParentIds = new Set<string>();
        const nodeToDataSourceMap = new Map<
          string,
          (typeof remoteDatabaseViews)[0]
        >();

        searchResult.value.nodes.forEach((node) => {
          node.parents.forEach((parentId) => allParentIds.add(parentId));
          const dsView = remoteDatabaseViews.find(
            (dsView) =>
              dsView.dataSource.dustAPIDataSourceId === node.data_source_id
          );
          if (dsView) {
            nodeToDataSourceMap.set(node.node_id, dsView);
          }
        });

        // Fetch all parent nodes in one batch if needed
        const parentTitleMap = new Map<string, string>();
        if (allParentIds.size > 0) {
          // Group parent IDs by data source
          const parentsByDataSource = new Map<string, string[]>();
          for (const node of searchResult.value.nodes) {
            const dsView = nodeToDataSourceMap.get(node.node_id);
            if (dsView) {
              const dsId = dsView.dataSource.dustAPIDataSourceId;
              if (!parentsByDataSource.has(dsId)) {
                parentsByDataSource.set(dsId, []);
              }
              node.parents.forEach((parentId) => {
                parentsByDataSource.get(dsId)!.push(parentId);
              });
            }
          }

          // Fetch parents for each data source
          for (const [dsId, parentIds] of parentsByDataSource) {
            const uniqueParentIds = [...new Set(parentIds)];
            if (uniqueParentIds.length > 0) {
              const parentNodesResult = await coreAPI.searchNodes({
                filter: {
                  node_ids: uniqueParentIds,
                  data_source_views: [
                    {
                      data_source_id: dsId,
                      view_filter: [],
                    },
                  ],
                },
                options: {
                  limit: uniqueParentIds.length,
                },
              });

              if (parentNodesResult.isOk()) {
                parentNodesResult.value.nodes.forEach((parentNode) => {
                  parentTitleMap.set(parentNode.node_id, parentNode.title);
                });
              }
            }
          }
        }

        // Find the corresponding data source for each node and format results
        const data = searchResult.value.nodes.map((node) => {
          const dataSourceView = nodeToDataSourceMap.get(node.node_id);

          if (!dataSourceView) {
            return renderNode(node, dataSourceIdToConnectorMap);
          }

          // Determine the type prefix based on the node type
          let nodeIdPrefix = "table";
          if (node.node_type === "folder") {
            const mimeType = node.mime_type.toLowerCase();
            nodeIdPrefix = mimeType.includes("schema") ? "schema" : "database";
          }

          // Build human-readable parent path
          const parentTitles = node.parents
            .map((parentId) => parentTitleMap.get(parentId) || parentId)
            .filter((title) => title); // Remove empty titles

          // Build a concise location description
          let locationPath = "";
          if (parentTitles.length > 0) {
            // Show full hierarchy path
            locationPath = [
              dataSourceView.dataSource.name,
              ...parentTitles,
            ].join(" / ");
          } else {
            // Just show warehouse name
            locationPath = dataSourceView.dataSource.name;
          }

          // Override the node to include enhanced information
          const modifiedNode = {
            ...node,
            node_id: `${nodeIdPrefix}-${dataSourceView.dataSource.sId}-${node.node_id}`,
            // Keep the original title
            title: node.title,
            // Keep original parents array (with IDs) for the path
            parents: node.parents,
            // Set parent_title to include the location info for display
            // This field is displayed in the UI
            parent_title: locationPath,
          };

          return renderNode(modifiedNode, dataSourceIdToConnectorMap);
        });

        const hasMore = searchResult.value.next_page_cursor !== null;
        const queryText = query ? `"${query}"` : "all tables";
        const scopeText = rootNodeId
          ? ` within ${rootNodeId}`
          : " across all warehouses";

        return new Ok([
          {
            type: "resource" as const,
            resource: {
              mimeType:
                "application/vnd.dust.tool-output.tables-filesystem-browse",
              uri: "",
              text: `Found ${data.length} result${data.length !== 1 ? "s" : ""} for ${queryText}${scopeText}.${hasMore ? " More results available." : ""}`,
              nodeId: rootNodeId || null,
              data,
              nextPageCursor: searchResult.value.next_page_cursor,
              resultCount: data.length,
            },
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
