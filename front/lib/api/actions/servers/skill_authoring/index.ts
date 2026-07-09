import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { SKILL_AUTHORING_SERVER_NAME } from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/skill_authoring/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(SKILL_AUTHORING_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: SKILL_AUTHORING_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
