import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SLIDESHOW_SERVER_NAME } from "@app/lib/api/actions/servers/slideshow/metadata";
import { createSlideshowTools } from "@app/lib/api/actions/servers/slideshow/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SLIDESHOW_SERVER_NAME);

  const tools = createSlideshowTools(auth, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: SLIDESHOW_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
