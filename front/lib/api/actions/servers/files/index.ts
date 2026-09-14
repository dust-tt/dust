import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import { createFilesTools } from "@app/lib/api/actions/servers/files/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<McpServer> {
  const server = makeInternalMCPServer(FILES_SERVER_NAME);

  const tools = await createFilesTools(auth);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: FILES_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
