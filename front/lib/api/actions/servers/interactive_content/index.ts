import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import {
  isAgentLoopRunContext,
  type ToolContext,
} from "@app/lib/actions/types";
import {
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/interactive_content/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<McpServer> {
  const server = makeInternalMCPServer(INTERACTIVE_CONTENT_SERVER_NAME);

  // The file-id edit tool is deprecated in favor of editing the Frame's mounted source by path
  // with the files server, then publishing. Conversations without the file system (created
  // before it defaulted on) have no path tools, so they keep it.
  //
  // The file-id retrieve tool stays everywhere, including file-system conversations: unlike
  // edit, it reads the canonical original directly by FileResource id rather than through the
  // mount, so it still works for a Frame whose mountFilePath hasn't been resolved (e.g. one
  // predating the mount system that has not gone through the backfill). The path-based files
  // tools have no fallback for that case (files.resolve and the mount read both require
  // mountFilePath to be set), so removing retrieve would leave such a Frame unreadable.
  const runContext = toolContext?.runContext;
  const conversation = isAgentLoopRunContext(runContext)
    ? runContext.conversation
    : toolContext?.listToolsContext?.conversation;
  const tools =
    conversation?.metadata?.useFileSystem === true
      ? TOOLS.filter(
          (tool) => tool.name !== EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME
        )
      : TOOLS;
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: INTERACTIVE_CONTENT_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
