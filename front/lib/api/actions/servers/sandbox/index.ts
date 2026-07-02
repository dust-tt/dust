import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOL_NAME } from "@app/lib/api/actions/servers/sandbox/metadata";
import { createSandboxTools } from "@app/lib/api/actions/servers/sandbox/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("sandbox");

  const tools = await createSandboxTools(auth, toolContext);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: SANDBOX_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
