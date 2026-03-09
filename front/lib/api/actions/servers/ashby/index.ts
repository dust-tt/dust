import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { ASHBY_SERVER } from "@app/lib/api/actions/servers/ashby/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/ashby/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ashby");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      // Putting all the tools under the same name, will reconsider if we need more granularity.
      monitoringName: "ashby",
    });
  }

  return server;
}

export { ASHBY_SERVER };

export default createServer;
