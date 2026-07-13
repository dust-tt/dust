import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { FRESHSERVICE_SERVER } from "@app/lib/api/actions/servers/freshservice/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/freshservice/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer("freshservice");

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "freshservice",
    });
  }

  return server;
}

export { FRESHSERVICE_SERVER };

export default createServer;
