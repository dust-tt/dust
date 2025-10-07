import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  getCurrentUser,
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

  return server;
};

export default createServer;
