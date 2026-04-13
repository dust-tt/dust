import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { PROJECT_TODOS_SERVER_NAME } from "@app/lib/api/actions/servers/project_todos/metadata";
import { createProjectTodosTools } from "@app/lib/api/actions/servers/project_todos/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(PROJECT_TODOS_SERVER_NAME);

  const tools = createProjectTodosTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: PROJECT_TODOS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
