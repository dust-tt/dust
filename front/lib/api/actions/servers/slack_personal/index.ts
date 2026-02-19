import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SLACK_TOOL_LOG_NAME } from "./metadata";
import type { SlackAIStatus } from "./tools";
import {
  createSlackPersonalTools,
  getSlackAIEnablementStatus,
  getSlackConnectionForMCPServer,
} from "./tools";

const localLogger = logger.child({ module: "mcp_slack_personal" });

async function createServer(
  auth: Authenticator,
  mcpServerId: string,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("slack");

  const c = await getSlackConnectionForMCPServer(auth, mcpServerId);

  const slackAIStatus: SlackAIStatus = c.isOk()
    ? await getSlackAIEnablementStatus({ accessToken: c.value.access_token })
    : "disconnected";

  localLogger.info(
    {
      mcpServerId,
      workspaceId: auth.getNonNullableWorkspace().sId,
      slackAIStatus,
    },
    "Slack MCP server initialized"
  );

  const { searchMessagesTool, semanticSearchMessagesTool, commonTools } =
    createSlackPersonalTools(auth, mcpServerId, agentLoopContext);

  // Register search tool based on Slack AI status.
  // If we're not connected to Slack, we arbitrarily include the keyword search tool,
  // just so there is one in the list. As soon as we're connected, it will show the correct one.
  if (slackAIStatus === "disabled" || slackAIStatus === "disconnected") {
    registerTool(auth, agentLoopContext, server, searchMessagesTool, {
      monitoringName: SLACK_TOOL_LOG_NAME,
    });
  }

  if (slackAIStatus === "enabled") {
    registerTool(auth, agentLoopContext, server, semanticSearchMessagesTool, {
      monitoringName: SLACK_TOOL_LOG_NAME,
    });
  }

  // Register all common tools.
  for (const tool of commonTools) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: SLACK_TOOL_LOG_NAME,
    });
  }

  return server;
}

export default createServer;
