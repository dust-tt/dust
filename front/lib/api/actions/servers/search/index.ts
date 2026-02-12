import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  SEARCH_SERVER,
  SEARCH_SERVER_NAME,
} from "@app/lib/api/actions/servers/search/metadata";
import {
  TOOLS_WITH_TAGS,
  TOOLS_WITHOUT_TAGS,
} from "@app/lib/api/actions/servers/search/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SEARCH_SERVER_NAME);

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  for (const tool of areTagsDynamic ? TOOLS_WITH_TAGS : TOOLS_WITHOUT_TAGS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: SEARCH_SERVER_NAME,
    });
  }

  return server;
}

export { SEARCH_SERVER };

export default createServer;
