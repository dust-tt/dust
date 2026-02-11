import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { DISCOVER_SKILLS_TOOL_NAME } from "@app/lib/api/actions/servers/discover_skills/metadata";
import { createDiscoverSkillsTools } from "@app/lib/api/actions/servers/discover_skills/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("discover_skills");

  const tools = createDiscoverSkillsTools(auth);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: DISCOVER_SKILLS_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
