import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SNOWFLAKE_TOOL_NAME } from "@app/lib/api/actions/servers/snowflake/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/snowflake/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("snowflake");

  for (const tool of TOOLS) {
    registerTool(auth, server, agentLoopContext, SNOWFLAKE_TOOL_NAME, tool);
  }

  return server;
}

export default createServer;
