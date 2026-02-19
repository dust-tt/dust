import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { AGENT_COPILOT_CONTEXT_TOOL_NAME } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/agent_copilot_context/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("agent_copilot_context");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: AGENT_COPILOT_CONTEXT_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
