import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  getCurrentUser,
  listPages,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/confluence_api_helper";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";

const createServer = (): McpServer => {
  const server = makeInternalMCPServer("confluence");

  server.tool(
    "get_current_user",
    "Get information about the currently authenticated Confluence user including account ID, display name, and email.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getCurrentUser(baseUrl, accessToken);
          if (result.isErr()) {
            throw new Error(`Error getting current user: ${result.error}`);
          }
          return makeMCPToolJSONSuccess({
            message: "Current user information retrieved successfully",
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_pages",
    "Search for Confluence pages using CQL (Confluence Query Language). Only returns page objects. Examples: 'type=page AND space=DEV', 'type=page AND title~\"meeting\"', 'type=page AND creator=currentUser()'",
    {
      cql: z
        .string()
        .describe(
          "CQL query string. Must include 'type=page' to filter for pages only."
        ),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from previous response for next page"),
      limit: z
        .number()
        .optional()
        .describe("Number of results per page (default 25)"),
    },
    async (params, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await listPages(baseUrl, accessToken, params);
          if (result.isErr()) {
            throw new Error(`Error listing pages: ${result.error}`);
          }
          return makeMCPToolJSONSuccess({
            message:
              result.value.results.length === 0
                ? "No pages found"
                : `Found ${result.value.results.length} page(s)`,
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
