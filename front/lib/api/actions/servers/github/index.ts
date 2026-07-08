import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { createGithubTools } from "@app/lib/api/actions/servers/github/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer("github");

  const tools = createGithubTools(auth);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "github",
    });
  }

  return server;
}

export default createServer;
