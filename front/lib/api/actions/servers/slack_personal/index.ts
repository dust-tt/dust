import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

import type { SlackAIStatus } from "./tools";
import {
  createSlackPersonalTools,
  getSlackAIEnablementStatus,
  getSlackConnectionForMCPServer,
} from "./tools";

const localLogger = logger.child({ module: "mcp_slack_personal" });

export async function createSlackPersonalToolsForContext(
  auth: Authenticator,
  mcpServerId: string,
  toolContext?: ToolContext
): Promise<ToolDefinition[]> {
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
    createSlackPersonalTools(auth, mcpServerId, toolContext);

  // Register search tool based on Slack AI status.
  // If we're not connected to Slack, we arbitrarily include the keyword search tool,
  // just so there is one in the list. As soon as we're connected, it will show the correct one.
  if (slackAIStatus === "disabled" || slackAIStatus === "disconnected") {
    return [searchMessagesTool, ...commonTools];
  }

  return [semanticSearchMessagesTool, ...commonTools];
}
