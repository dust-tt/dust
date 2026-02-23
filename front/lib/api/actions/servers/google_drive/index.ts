import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { GOOGLE_DRIVE_TOOL_NAME } from "@app/lib/api/actions/servers/google_drive/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/google_drive/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("google_drive");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: GOOGLE_DRIVE_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
