import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import {
  LIST_WORKSPACE_MEMBERS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/workspace_management/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(WORKSPACE_MANAGEMENT_SERVER_NAME);

  for (const tool of TOOLS) {
    // Keep the member listing out of non-managers' tool list entirely; the handler refuses them
    // anyway, but there is no point offering a tool they cannot use.
    if (tool.name === LIST_WORKSPACE_MEMBERS_TOOL_NAME && !auth.isManager()) {
      continue;
    }
    registerTool(auth, toolContext, server, tool, {
      monitoringName: WORKSPACE_MANAGEMENT_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
