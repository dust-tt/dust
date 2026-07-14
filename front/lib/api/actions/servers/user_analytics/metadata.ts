import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { timeWindowSchemaShape } from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { MIN_USERS_FOR_ANONYMITY } from "@app/lib/api/assistant/observability/anonymity";
import { JOB_TYPES } from "@app/types/job_type";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const USER_ANALYTICS_SERVER_NAME = "user_analytics" as const;

export const USER_ANALYTICS_TOOLS_METADATA = createToolsRecord({
  get_personal_usage: {
    description:
      "Get the authenticated user's personal usage over a time window " +
      "(defaults to the last 30 days): top agents, top skills, and top tools " +
      "ranked by execution count. Set jobType to instead " +
      "get aggregated usage across all workspace " +
      "members sharing that job type — only returned when at least " +
      `${MIN_USERS_FOR_ANONYMITY} members share it, to keep ` +
      "individuals anonymous.",
    schema: {
      ...timeWindowSchemaShape,
      jobType: z
        .enum(JOB_TYPES)
        .optional()
        .describe(
          "When set, return aggregated usage for all workspace members with " +
            "this job type instead of the caller's own usage. Only returned " +
            `when at least ${MIN_USERS_FOR_ANONYMITY} members ` +
            "share the job type, to keep individuals anonymous."
        ),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Fetching your usage",
      done: "Fetched your usage",
    },
  },
  get_workspace_activity: {
    description:
      "Get anonymized workspace-wide activity over the last 30 days: " +
      "most popular agents by usage rank and trending skills. No individual " +
      "user attribution, and only returned when at least " +
      `${MIN_USERS_FOR_ANONYMITY} users were active, to keep individuals ` +
      "anonymous.",
    schema: {},
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
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
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(USER_ANALYTICS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
