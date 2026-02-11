import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  TOOLS_WITH_TAGS,
  TOOLS_WITHOUT_TAGS,
} from "@app/lib/api/actions/servers/data_sources_file_system/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("data_sources_file_system");

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  for (const tool of areTagsDynamic ? TOOLS_WITH_TAGS : TOOLS_WITHOUT_TAGS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: tool.name,
    });
  }

  return server;
}

export default createServer;
