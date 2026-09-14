import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { FILE_GENERATION_TOOL_NAME } from "@app/lib/api/actions/servers/file_generation/metadata";
import { createFileGenerationTools } from "@app/lib/api/actions/servers/file_generation/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<McpServer> {
  const server = makeInternalMCPServer("file_generation");

  const tools = await createFileGenerationTools(auth);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: FILE_GENERATION_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
