import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { CURSOR_CLOUD_AGENTS_SERVER_NAME } from "@app/lib/api/actions/servers/cursor_cloud_agents/metadata";
import { createCursorCloudAgentsTools } from "@app/lib/api/actions/servers/cursor_cloud_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(CURSOR_CLOUD_AGENTS_SERVER_NAME);

  for (const tool of createCursorCloudAgentsTools(auth, toolContext)) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: CURSOR_CLOUD_AGENTS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
