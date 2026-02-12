import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SLACK_BOT_TOOL_NAME } from "@app/lib/api/actions/servers/slack_bot/metadata";
import { createSlackBotTools } from "@app/lib/api/actions/servers/slack_bot/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
async function createServer(
  auth: Authenticator,
  mcpServerId: string,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("slack_bot");

  const tools = createSlackBotTools(auth, mcpServerId, agentLoopContext);
  for (const tool of tools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: SLACK_BOT_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
