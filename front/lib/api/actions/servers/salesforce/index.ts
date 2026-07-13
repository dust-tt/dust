import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { createSalesforceTools } from "@app/lib/api/actions/servers/salesforce/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer("salesforce");

  const tools = createSalesforceTools(auth);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "salesforce",
    });
  }

  return server;
}

export default createServer;
