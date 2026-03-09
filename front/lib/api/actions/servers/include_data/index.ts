import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { INCLUDE_DATA_TOOL_NAME } from "@app/lib/api/actions/servers/include_data/metadata";
import { createIncludeDataTools } from "@app/lib/api/actions/servers/include_data/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("include_data");

  const tools = createIncludeDataTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: INCLUDE_DATA_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
