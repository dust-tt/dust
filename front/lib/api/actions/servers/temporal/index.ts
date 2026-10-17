import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { TOOLS } from "@app/lib/api/actions/servers/temporal/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer("temporal");

  // Tools re-check every gate at execution time; this only spares non super users a tool list
  // they cannot use.
  const user = auth.user();
  if (!user?.isDustSuperUser) {
    server.tool(
      "temporal_not_available",
      "Temporal tools require Dust super user privileges.",
      {},
      async () => ({
        isError: true,
        content: [
          {
            type: "text",
            text: "Access denied: Temporal tools require Dust super user privileges.",
          },
        ],
      })
    );
    return server;
  }

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "temporal",
    });
  }

  return server;
}

export default createServer;
