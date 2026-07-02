import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const USER_ANALYTICS_SERVER_NAME = "user_analytics" as const;

export const USER_ANALYTICS_TOOLS_METADATA = createToolsRecord({
  get_personal_usage: {
    description:
      "Get this user's activity summary over the last 30 days: total agent messages and conversations, " +
      "top skills and tools ranked by execution count. Always scoped to the authenticated user.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Fetching your usage",
      done: "Fetched your usage",
    },
  },
  get_workspace_activity: {
    description:
      "Get anonymized workspace-wide activity over the last 30 days: " +
      "high-level overview (active users, total messages, conversation count), " +
      "most popular agents by usage rank, and trending skills and tools. No individual user attribution.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Fetching workspace activity",
      done: "Fetched workspace activity",
    },
  },
});

export const USER_ANALYTICS_SERVER = {
  serverInfo: {
    name: USER_ANALYTICS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Fetch personal usage stats and anonymized workspace activity data.",
    authorization: null,
    icon: "ActionPieChartIcon",
    documentationUrl: null,
  },
  tools: Object.values(USER_ANALYTICS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(USER_ANALYTICS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
