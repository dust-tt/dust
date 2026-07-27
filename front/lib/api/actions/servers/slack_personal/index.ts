import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SLACK_TOOL_LOG_NAME } from "./metadata";
import {
  getSlackAIEnablementStatus,
  getSlackConnectionForMCPServer,
  type SlackAIStatus,
  TOOLS,
} from "./tools";

const localLogger = logger.child({ module: "mcp_slack_personal" });

async function createServer(
  auth: Authenticator,
  mcpServerId: string,
  toolContext?: ToolContext
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

  const allowFooterRemoval =
    auth.workspace()?.metadata?.slackPersonalAllowFooterRemoval ?? false;
  // When footer removal is not allowed, strip show_sent_by_footer from the schema so
  // the LLM never sees the parameter — the handler already enforces true server-side.
  const tools = allowFooterRemoval
    ? TOOLS
    : TOOLS.map((tool) => {
        if (tool.name === "post_message" || tool.name === "schedule_message") {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { show_sent_by_footer: _stripped, ...schemaWithoutFooter } =
            tool.schema;
          return { ...tool, schema: schemaWithoutFooter };
        }
        return tool;
      });

  const searchMessagesTool = tools.find((t) => t.name === "search_messages")!;
  const semanticSearchMessagesTool = tools.find(
    (t) => t.name === "semantic_search_messages"
  )!;
  const commonTools = tools.filter(
    (t) => t.name !== "search_messages" && t.name !== "semantic_search_messages"
  );

  // Register search tool based on Slack AI status.
  // If we're not connected to Slack, we arbitrarily include the keyword search tool,
  // just so there is one in the list. As soon as we're connected, it will show the correct one.
  if (slackAIStatus === "disabled" || slackAIStatus === "disconnected") {
    registerTool(auth, toolContext, server, searchMessagesTool, {
      monitoringName: SLACK_TOOL_LOG_NAME,
    });
  }

  if (slackAIStatus === "enabled") {
    registerTool(auth, toolContext, server, semanticSearchMessagesTool, {
      monitoringName: SLACK_TOOL_LOG_NAME,
    });
  }

  // Register all common tools.
  for (const tool of commonTools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: SLACK_TOOL_LOG_NAME,
    });
  }

  return server;
}

export default createServer;
