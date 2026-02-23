import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { OPENAI_USAGE_TOOL_NAME } from "@app/lib/api/actions/servers/openai_usage/metadata";
import { createOpenAIUsageTools } from "@app/lib/api/actions/servers/openai_usage/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("openai_usage");

  const tools = createOpenAIUsageTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: OPENAI_USAGE_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
