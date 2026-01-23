import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DEFAULT_WEBSEARCH_ACTION_NAME } from "@app/lib/actions/constants";
import {
  registerWebBrowserTool,
  registerWebSearchTool,
} from "@app/lib/actions/mcp_internal_actions/tools/web_browser/web_browser_tools";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(DEFAULT_WEBSEARCH_ACTION_NAME);

  registerWebSearchTool(auth, server, agentLoopContext);
  registerWebBrowserTool(auth, server, agentLoopContext);

  return server;
}

export default createServer;
