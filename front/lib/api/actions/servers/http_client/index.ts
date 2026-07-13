import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { HTTP_CLIENT_TOOL_NAME } from "@app/lib/api/actions/servers/http_client/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/http_client/tools";
import { TOOLS as WEB_TOOLS } from "@app/lib/api/actions/servers/web_search_browse/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(HTTP_CLIENT_TOOL_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: HTTP_CLIENT_TOOL_NAME,
    });
  }

  // This server can be added mid-conversation, so its web tools must not inherit
  // the dedicated web server's eager flag and invalidate the cached tool prefix.
  for (const tool of WEB_TOOLS) {
    const deferredTool = { ...tool, eager: undefined };
    registerTool(auth, toolContext, server, deferredTool, {
      monitoringName: HTTP_CLIENT_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
