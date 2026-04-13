import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { CLARI_COPILOT_SERVER } from "@app/lib/api/actions/servers/clari_copilot/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/clari_copilot/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("clari_copilot");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: "clari_copilot",
    });
  }

  return server;
}

export { CLARI_COPILOT_SERVER };

export default createServer;
