import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { CONVERSATION_FILES_SERVER_NAME } from "@app/lib/api/actions/servers/conversation_files/metadata";
import {
  TOOLS,
  TOOLS_IN_PROJECT,
} from "@app/lib/api/actions/servers/conversation_files/tools";
import type { Authenticator } from "@app/lib/auth";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("conversation_files");

  const conversation =
    agentLoopContext?.runContext?.conversation ??
    agentLoopContext?.listToolsContext?.conversation;

  if (conversation && isProjectConversation(conversation)) {
    for (const tool of TOOLS_IN_PROJECT) {
      registerTool(auth, agentLoopContext, server, tool, {
        monitoringName: CONVERSATION_FILES_SERVER_NAME,
      });
    }
  } else {
    for (const tool of TOOLS) {
      registerTool(auth, agentLoopContext, server, tool, {
        monitoringName: CONVERSATION_FILES_SERVER_NAME,
      });
    }
  }
  return server;
}

export default createServer;
