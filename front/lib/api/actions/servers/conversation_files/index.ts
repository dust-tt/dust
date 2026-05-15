import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { CONVERSATION_FILES_SERVER_NAME } from "@app/lib/api/actions/servers/conversation_files/metadata";
import {
  TOOLS,
  TOOLS_WITH_FILESYSTEM,
} from "@app/lib/api/actions/servers/conversation_files/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("conversation_files");

  const conversation =
    agentLoopContext?.runContext?.conversation ??
    agentLoopContext?.listToolsContext?.conversation;
  const useFileSystem = conversation?.metadata?.useFileSystem === true;

  for (const tool of useFileSystem ? TOOLS_WITH_FILESYSTEM : TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: CONVERSATION_FILES_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
