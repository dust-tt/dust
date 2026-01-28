import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

import { PRODUCTBOARD_SERVER, PRODUCTBOARD_TOOL_NAME } from "./metadata";
import { TOOLS } from "./tools";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("productboard");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: PRODUCTBOARD_TOOL_NAME,
    });
  }

  return server;
}

export { PRODUCTBOARD_SERVER };

export default createServer;
