import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { INTERACTIVE_CONTENT_SERVER_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import createInteractiveContentV2Server from "@app/lib/api/actions/servers/interactive_content_v2";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<McpServer> {
  if (await hasFeatureFlag(auth, "frames_v2")) {
    return createInteractiveContentV2Server(auth, toolContext);
  }

  const server = makeInternalMCPServer(INTERACTIVE_CONTENT_SERVER_NAME);

  const tools = await createInteractiveContentTools(auth, toolContext);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: INTERACTIVE_CONTENT_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
