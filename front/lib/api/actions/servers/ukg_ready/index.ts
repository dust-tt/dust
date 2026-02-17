import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { UKG_READY_TOOL_NAME } from "@app/lib/api/actions/servers/ukg_ready/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/ukg_ready/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ukg_ready");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: UKG_READY_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
