import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  ZENDESK_SERVER,
  ZENDESK_TOOL_NAME,
} from "@app/lib/api/actions/servers/zendesk/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/zendesk/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("zendesk");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: ZENDESK_TOOL_NAME,
    });
  }

  return server;
}

export { ZENDESK_SERVER };

export default createServer;
