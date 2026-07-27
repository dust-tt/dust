import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import {
  BASE_TOOLS,
  TOOLS_WITH_TAGS,
} from "@app/lib/api/actions/servers/include_data/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer("include_data");

  const tools =
    toolContext && shouldAutoGenerateTags(toolContext)
      ? TOOLS_WITH_TAGS
      : BASE_TOOLS;
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: "include_data",
    });
  }

  return server;
}

export default createServer;
