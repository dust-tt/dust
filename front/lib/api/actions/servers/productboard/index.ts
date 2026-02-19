import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { PRODUCTBOARD_TOOL_NAME } from "@app/lib/api/actions/servers/productboard/metadata";
import { createProductboardTools } from "@app/lib/api/actions/servers/productboard/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("productboard");

  const tools = createProductboardTools();
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: PRODUCTBOARD_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
