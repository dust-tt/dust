import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { DATA_WAREHOUSES_TOOL_NAME } from "@app/lib/api/actions/servers/data_warehouses/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/data_warehouses/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("data_warehouses");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: DATA_WAREHOUSES_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
