import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { PRIMITIVE_TYPES_DEBUGGER_TOOL_NAME } from "@app/lib/api/actions/servers/primitive_types_debugger/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/primitive_types_debugger/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("primitive_types_debugger");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: PRIMITIVE_TYPES_DEBUGGER_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
