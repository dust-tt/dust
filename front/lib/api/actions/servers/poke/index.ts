import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { TOOLS } from "@app/lib/api/actions/servers/poke/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer("poke");

  // Gate at server creation: if the caller is not a Dust super user, register
  // a single error tool so the agent gets a clear message.
  // Note: here we do not use the authenticator's isDustSuperUser method because the authenticator is created using the regular flow.
  // Only poke create super user's authenticators.
  const user = auth.user();
  if (!user?.isDustSuperUser) {
    server.tool(
      "poke_not_available",
      "Poke tools require Dust super user privileges.",
      {},
      async () => ({
        isError: true,
        content: [
          {
            type: "text",
            text: "Access denied: poke tools require Dust super user privileges.",
          },
        ],
      })
    );
    return server;
  }

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "poke",
    });
  }

  return server;
}

export default createServer;
