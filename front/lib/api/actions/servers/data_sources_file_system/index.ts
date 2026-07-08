import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import {
  TOOLS_WITH_TAGS,
  TOOLS_WITHOUT_TAGS,
} from "@app/lib/api/actions/servers/data_sources_file_system/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("data_sources_file_system");

  const areTagsDynamic = toolContext
    ? shouldAutoGenerateTags(toolContext)
    : false;
  const tools = areTagsDynamic ? TOOLS_WITH_TAGS : TOOLS_WITHOUT_TAGS;

  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: tool.name,
    });
  }

  return server;
}

export default createServer;
