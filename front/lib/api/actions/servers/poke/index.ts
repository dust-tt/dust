import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { POKE_SERVER_NAME } from "@app/lib/api/actions/servers/poke/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/poke/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(POKE_SERVER_NAME);

  // Gate at server creation: if the caller is not a Dust super user, register
  // a single error tool so the agent gets a clear message.
  if (!auth.isDustSuperUser()) {
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
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: POKE_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
