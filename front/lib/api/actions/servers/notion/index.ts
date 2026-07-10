import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { NOTION_TOOL_NAME } from "@app/lib/api/actions/servers/notion/metadata";
import { createNotionTools } from "@app/lib/api/actions/servers/notion/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer("notion");

  const tools = createNotionTools(toolContext);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: NOTION_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
