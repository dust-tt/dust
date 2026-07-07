import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { POD_DATABASES_SERVER_NAME } from "@app/lib/api/actions/servers/pod_databases/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/pod_databases/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer(POD_DATABASES_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: POD_DATABASES_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
