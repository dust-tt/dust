import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { OUTLOOK_TOOL_NAME } from "@app/lib/api/actions/servers/outlook/mail_metadata";
import { TOOLS } from "@app/lib/api/actions/servers/outlook/tools/mail";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer("outlook");

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: OUTLOOK_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
