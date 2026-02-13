import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { AI_GUARD_TOOL_NAME } from "@app/lib/api/actions/servers/ai_guard/metadata";
import { createAIGuardTools } from "@app/lib/api/actions/servers/ai_guard/tools";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(AI_GUARD_TOOL_NAME);

  const tools = createAIGuardTools(config.getDdAiGuardEndpoint());
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: AI_GUARD_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
