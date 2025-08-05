import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { Ok } from "@app/types";

const TABLES_FILESYSTEM_TOOL_NAME = "tables_filesystem_navigation";

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
    "List the direct contents of a warehouse, schema, or database. Can be used to see what is inside a " +
      "specific location in the tables hierarchy, like 'ls' in Unix. If no nodeId is provided, lists " +
      "all available data warehouses at the root level.",
    {
      nodeId: z
        .string()
        .nullable()
        .describe(
          "The ID of the warehouse, schema, or database to list contents of. " +
            "If not provided, lists all available data warehouses at the root."
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results to return. Default is 50."),
      sortBy: z
        .enum(["name", "timestamp"])
        .optional()
        .describe(
          "Field to sort the results by. 'name' sorts alphabetically, 'timestamp' sorts by " +
            "most recent first. Default is 'name'."
        ),
    },
    withToolLogging(
      auth,
      { toolName: TABLES_FILESYSTEM_TOOL_NAME, agentLoopContext },
      async ({ nodeId, limit, sortBy }) => {
        // When nodeId is not null, listing warehouse contents is not yet implemented
        if (nodeId !== null) {
          return new Ok([
            {
              type: "text" as const,
              text: "Listing contents of specific warehouses is not yet implemented.",
            },
          ]);
        }

        // List all remote databases in the global space
        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

        // Get all data sources in the global space
        const dataSources = await DataSourceResource.listBySpace(
          auth,
          globalSpace
        );

        // Filter to only remote databases
        const remoteDatabases = dataSources.filter(isRemoteDatabase);

        // Sort if requested
        if (sortBy === "name") {
          remoteDatabases.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === "timestamp") {
          remoteDatabases.sort(
            (a, b) => b.editedAt.getTime() - a.editedAt.getTime()
          );
        }

        // Apply limit (default to 50 if not specified)
        const effectiveLimit = limit || 50;
        const limitedDatabases = remoteDatabases.slice(0, effectiveLimit);

        // Format the response
        const data = limitedDatabases.map((db) => ({
          nodeId: `warehouse-${db.sId}`,
          title: db.name,
          path: "", // Warehouses are at the root
          parentTitle: null,
          lastUpdatedAt: db.editedAt.toISOString(),
          sourceUrl: null,
          mimeType: "warehouse",
          hasChildren: true,
          connectorProvider: db.connectorProvider,
        }));

        return new Ok([
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_LIST,
              uri: "",
              text: `Found ${remoteDatabases.length} remote database${remoteDatabases.length !== 1 ? "s" : ""} in the global space.`,
              data,
              nextPageCursor: null,
              resultCount: remoteDatabases.length,
            },
          },
        ]);
      }
    )
  );

  return server;
};

export default createServer;
