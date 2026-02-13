import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { PROJECT_MANAGER_SERVER_NAME } from "@app/lib/api/actions/servers/project_manager/metadata";
import { createProjectManagerTools } from "@app/lib/api/actions/servers/project_manager/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Creates the project_manager MCP server.
 *
 * This server provides tools for managing projects:
 * - File operations: list, add, and update project files
 * - Metadata operations: edit description, add/edit URLs
 * - Search operations: search unread conversations
 */
function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(PROJECT_MANAGER_SERVER_NAME);

  const tools = createProjectManagerTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: PROJECT_MANAGER_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
