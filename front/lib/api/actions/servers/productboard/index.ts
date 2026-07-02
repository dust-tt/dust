import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { createProductboardTools } from "@app/lib/api/actions/servers/productboard/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer("productboard");

  const tools = createProductboardTools();
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "productboard",
    });
  }

  return server;
}

export default createServer;
