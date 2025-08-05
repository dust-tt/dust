import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { renderNode } from "@app/lib/actions/mcp_internal_actions/rendering";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ConnectorProvider, CoreAPIContentNode } from "@app/types";
import { CoreAPI, Ok } from "@app/types";

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
        .describe(`Maximum number of results to return. Default is ${DEFAULT_LIMIT}, max is ${MAX_LIMIT}.`),
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

  return server;
};

export default createServer;
