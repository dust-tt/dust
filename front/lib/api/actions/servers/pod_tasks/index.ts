import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { POD_TASKS_SERVER_NAME } from "@app/lib/api/actions/servers/pod_tasks/metadata";
import { createProjectTasksTools } from "@app/lib/api/actions/servers/pod_tasks/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(POD_TASKS_SERVER_NAME);

  const tools = createProjectTasksTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: POD_TASKS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
