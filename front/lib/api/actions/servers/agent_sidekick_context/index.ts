import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { AGENT_SIDEKICK_CONTEXT_TOOL_NAME } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/agent_sidekick_context/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer("agent_sidekick_context");

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: AGENT_SIDEKICK_CONTEXT_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
