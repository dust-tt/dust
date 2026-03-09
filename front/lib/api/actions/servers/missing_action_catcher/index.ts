import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { MISSING_ACTION_CATCHER_TOOL_NAME } from "@app/lib/api/actions/servers/missing_action_catcher/metadata";
import { createMissingActionCatcherTools } from "@app/lib/api/actions/servers/missing_action_catcher/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("missing_action_catcher");

  const tools = createMissingActionCatcherTools(agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: MISSING_ACTION_CATCHER_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
