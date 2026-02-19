import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  JIRA_SERVER,
  JIRA_TOOL_NAME,
} from "@app/lib/api/actions/servers/jira/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/jira/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("jira");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: JIRA_TOOL_NAME,
    });
  }

  return server;
}

export { JIRA_SERVER };

export default createServer;
