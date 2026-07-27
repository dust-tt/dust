import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { USER_MEMORY_SERVER_NAME } from "@app/lib/api/actions/servers/user_memory/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/user_memory/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(USER_MEMORY_SERVER_NAME);

  const user = auth.user();
  if (!user) {
    server.tool(
      "memory_not_available",
      "User memory is scoped to a user but no user is currently authenticated.",
      {},
      async () => {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No user memory available as there is no user authenticated.",
            },
          ],
        };
      }
    );
    return server;
  }

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: USER_MEMORY_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
