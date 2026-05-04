import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  CONVERSATION_CAT_FILE_ACTION_NAME,
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME,
} from "@app/lib/api/actions/servers/conversation_files/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/conversation_files/tools";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const NEW_FILE_EXPLORER_HIDDEN_TOOLS = new Set([
  CONVERSATION_CAT_FILE_ACTION_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME,
]);

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("conversation_files");

  const isNewFileExplorer = await hasFeatureFlag(auth, "new_file_explorer");

  for (const tool of TOOLS) {
    if (isNewFileExplorer && NEW_FILE_EXPLORER_HIDDEN_TOOLS.has(tool.name)) {
      continue;
    }

    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: CONVERSATION_FILES_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
