import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import {
  isAgentLoopRunContext,
  type ToolContextType,
} from "@app/lib/actions/types";
import { COMMON_UTILITIES_SERVER_NAME } from "@app/lib/api/actions/servers/common_utilities/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/common_utilities/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer(COMMON_UTILITIES_SERVER_NAME);

  const conversation =
    (isAgentLoopRunContext(toolContext?.runContext)
      ? toolContext.runContext.conversation
      : null) ?? toolContext?.listToolsContext?.conversation;

  for (const tool of TOOLS) {
    // Skip `set_conversation_title` if there is no conversation in tool context.
    if (!conversation && tool.name === "set_conversation_title") {
      continue;
    }
    registerTool(auth, toolContext, server, tool, {
      monitoringName: COMMON_UTILITIES_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
