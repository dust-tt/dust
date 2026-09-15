import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { BUILDING_AGENTS_AND_SKILLS_SERVER_NAME } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/building_agents_and_skills/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(BUILDING_AGENTS_AND_SKILLS_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
