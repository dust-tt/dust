import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  FILES_COPY_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/files/tools";
import type { Authenticator } from "@app/lib/auth";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Extra guidance appended to the `copy` tool description when the conversation belongs to a
// project. Keeps the static metadata generic and avoids advertising `project/...` paths to an
// agent in a non-project conversation that can't reach them.
const COPY_PROJECT_DESCRIPTION_ADDENDUM =
  " This conversation is part of a project, so you can also copy between scopes (e.g. " +
  "`conversation/report.pdf` -> `project/report.pdf`) to promote a file into the project";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(FILES_SERVER_NAME);

  const conversation =
    agentLoopContext?.runContext?.conversation ??
    agentLoopContext?.listToolsContext?.conversation;
  const isProject = conversation ? isProjectConversation(conversation) : false;

  for (const tool of TOOLS) {
    const finalTool =
      isProject && tool.name === FILES_COPY_ACTION_NAME
        ? {
            ...tool,
            description: tool.description + COPY_PROJECT_DESCRIPTION_ADDENDUM,
          }
        : tool;

    registerTool(auth, agentLoopContext, server, finalTool, {
      monitoringName: FILES_SERVER_NAME,
    });
  }
  return server;
}

export default createServer;
