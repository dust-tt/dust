import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { GONG_TOOL_NAME } from "@app/lib/api/actions/servers/gong/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/gong/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("gong");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: GONG_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
