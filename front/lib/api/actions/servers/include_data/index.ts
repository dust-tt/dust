import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { createIncludeDataTools } from "@app/lib/api/actions/servers/include_data/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer("include_data");

  const tools = createIncludeDataTools(auth, toolContext);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "include_data",
    });
  }

  return server;
}

export default createServer;
