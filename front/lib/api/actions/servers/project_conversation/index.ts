import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { PROJECT_CONVERSATION_SERVER_NAME } from "@app/lib/api/actions/servers/project_conversation/metadata";
import { createProjectConversationTools } from "@app/lib/api/actions/servers/project_conversation/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Creates the project_conversation MCP server.
 *
 * This server provides tools for creating conversations in projects:
 * - create_conversation: Create a new conversation and post a user message
 */
function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(PROJECT_CONVERSATION_SERVER_NAME);

  const tools = createProjectConversationTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: PROJECT_CONVERSATION_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
