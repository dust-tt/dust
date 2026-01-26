import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { PROJECT_CONTEXT_MANAGEMENT_SERVER_NAME } from "@app/lib/api/actions/servers/project_context_management/metadata";
import { createProjectContextManagementTools } from "@app/lib/api/actions/servers/project_context_management/tools";
import type { Authenticator } from "@app/lib/auth";

/**
 * Creates the project_context_management MCP server.
 *
 * This server provides tools for managing project context:
 * - File operations: list, add, and update project files
 * - Metadata operations: edit description, add/edit URLs
 */
function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(PROJECT_CONTEXT_MANAGEMENT_SERVER_NAME);

  const tools = createProjectContextManagementTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: PROJECT_CONTEXT_MANAGEMENT_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
