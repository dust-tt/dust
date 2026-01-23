import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerFileTools } from "@app/lib/actions/mcp_internal_actions/servers/project_context_management/file_operations";
import { registerMetadataTools } from "@app/lib/actions/mcp_internal_actions/servers/project_context_management/metadata_operations";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
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
  const server = makeInternalMCPServer("project_context_management");

  // Register all file-related tools.
  registerFileTools(server, auth, agentLoopContext);

  // Register all metadata-related tools.
  registerMetadataTools(server, auth, agentLoopContext);

  return server;
}

export default createServer;
