import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { TOOLS } from "@app/lib/api/actions/servers/slack_bot/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  _mcpServerId: string,
  toolContext?: ToolContext
): Promise<McpServer> {
  const server = makeInternalMCPServer("slack_bot");

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "slack_bot",
    });
  }

  return server;
}

export default createServer;
