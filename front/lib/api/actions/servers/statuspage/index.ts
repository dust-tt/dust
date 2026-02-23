import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { STATUSPAGE_TOOL_NAME } from "@app/lib/api/actions/servers/statuspage/metadata";
import { createStatuspageTools } from "@app/lib/api/actions/servers/statuspage/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("statuspage");

  const tools = createStatuspageTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: STATUSPAGE_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
