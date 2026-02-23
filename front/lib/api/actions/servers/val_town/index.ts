import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { VAL_TOWN_TOOL_NAME } from "@app/lib/api/actions/servers/val_town/metadata";
import { createValTownTools } from "@app/lib/api/actions/servers/val_town/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("val_town");

  const tools = createValTownTools(auth, agentLoopContext);

  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: VAL_TOWN_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
