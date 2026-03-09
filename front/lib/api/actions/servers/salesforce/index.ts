import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SALESFORCE_TOOL_NAME } from "@app/lib/api/actions/servers/salesforce/metadata";
import { createSalesforceTools } from "@app/lib/api/actions/servers/salesforce/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("salesforce");

  const tools = createSalesforceTools(auth);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: SALESFORCE_TOOL_NAME,
    });
  }

  return server;
}

export { SALESFORCE_SERVER } from "./metadata";
export default createServer;
