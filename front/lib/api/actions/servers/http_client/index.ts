import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { HTTP_CLIENT_TOOL_NAME } from "@app/lib/api/actions/servers/http_client/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/http_client/tools";
import { TOOLS as WEB_TOOLS } from "@app/lib/api/actions/servers/web_search_browse/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(HTTP_CLIENT_TOOL_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: HTTP_CLIENT_TOOL_NAME,
    });
  }

  // Register web tools (websearch, webbrowser)
  for (const tool of WEB_TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: HTTP_CLIENT_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
