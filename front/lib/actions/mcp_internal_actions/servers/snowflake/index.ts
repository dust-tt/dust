import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  _auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("snowflake");

  // Tools will be implemented in a follow-up PR

  return server;
}

export default createServer;
