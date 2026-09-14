import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { INTERACTIVE_CONTENT_SERVER_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentV2Tools } from "@app/lib/api/actions/servers/interactive_content_v2/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export default async function createInteractiveContentV2Server(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<McpServer> {
  const server = makeInternalMCPServer(INTERACTIVE_CONTENT_SERVER_NAME);
  const tools = await createInteractiveContentV2Tools(auth, toolContext);

  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: INTERACTIVE_CONTENT_SERVER_NAME,
    });
  }

  return server;
}
