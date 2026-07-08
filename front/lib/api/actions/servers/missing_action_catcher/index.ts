import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { createMissingActionCatcherTools } from "@app/lib/api/actions/servers/missing_action_catcher/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer("missing_action_catcher");

  const tools = createMissingActionCatcherTools(toolContext);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "missing_action_catcher",
    });
  }

  return server;
}

export default createServer;
