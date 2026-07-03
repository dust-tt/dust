import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import {
  isAgentLoopRunContext,
  type ToolContextType,
} from "@app/lib/actions/types";
import { CONVERSATION_FILES_SERVER_NAME } from "@app/lib/api/actions/servers/conversation_files/metadata";
import {
  TOOLS,
  TOOLS_WITH_FILESYSTEM,
} from "@app/lib/api/actions/servers/conversation_files/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("conversation_files");

  const conversation =
    (isAgentLoopRunContext(toolContext?.runContext)
      ? toolContext.runContext.conversation
      : null) ?? toolContext?.listToolsContext?.conversation;
  const useFileSystem = conversation?.metadata?.useFileSystem === true;

  // Returns no tool at all if there is no conversation in tool context.
  if (conversation) {
    for (const tool of useFileSystem ? TOOLS_WITH_FILESYSTEM : TOOLS) {
      registerTool(auth, toolContext, server, tool, {
        monitoringName: CONVERSATION_FILES_SERVER_NAME,
      });
    }
  }

  return server;
}

export default createServer;
