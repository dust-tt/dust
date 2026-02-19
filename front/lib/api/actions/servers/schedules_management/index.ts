import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SCHEDULES_MANAGEMENT_TOOL_NAME } from "@app/lib/api/actions/servers/schedules_management/metadata";
import { createSchedulesManagementTools } from "@app/lib/api/actions/servers/schedules_management/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("schedules_management");

  const tools = createSchedulesManagementTools(auth, agentLoopContext);

  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: SCHEDULES_MANAGEMENT_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
