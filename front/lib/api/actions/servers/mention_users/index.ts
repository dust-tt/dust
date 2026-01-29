import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { MENTION_USERS_SERVER_NAME } from "@app/lib/api/actions/servers/mention_users/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/mention_users/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(MENTION_USERS_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: MENTION_USERS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
