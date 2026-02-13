import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { USER_ASK_QUESTION_SERVER_NAME } from "@app/lib/api/actions/servers/user_ask_question/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/user_ask_question/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(USER_ASK_QUESTION_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: USER_ASK_QUESTION_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
