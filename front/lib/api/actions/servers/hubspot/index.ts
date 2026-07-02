import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { HUBSPOT_SERVER } from "@app/lib/api/actions/servers/hubspot/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/hubspot/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer("hubspot");

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "hubspot",
    });
  }

  return server;
}

export { HUBSPOT_SERVER };

export default createServer;
