import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DEFAULT_CREDIT_GROUPS,
  DEFAULT_RESULTS,
  MAX_CREDIT_GROUPS,
  MAX_RESULTS,
  timeWindowSchemaShape,
  usageFilterSchema,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const topListSchema = (entityPlural: string) => ({
  ...timeWindowSchemaShape,
  ...usageFilterSchema,
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_RESULTS)
    .optional()
    .describe(
      `Maximum number of ${entityPlural} to return ` +
        `(default ${DEFAULT_RESULTS}, max ${MAX_RESULTS}).`
    ),
});

const getTopAgentsSchema = topListSchema("agents");
const getTopUsersSchema = topListSchema("users");
const getTopSkillsSchema = topListSchema("skills");
const getTopToolsSchema = topListSchema("tools");

const getSourceBreakdownSchema = {
  ...timeWindowSchemaShape,
  agentIds: usageFilterSchema.agentIds,
  userIds: usageFilterSchema.userIds,
};

const getAgentDetailsSchema = {
  agentId: z
    .string()
    .describe(
      "The agent's id (sId), as returned by get_top_agents or other tools."
    ),
};

const getCreditUsageSchema = {
  ...timeWindowSchemaShape,
  ...usageFilterSchema,
  groupBy: z
    .enum(["agent", "user", "none"])
    .optional()
    .describe(
      "Break the estimated credits down by top 'agent' or 'user', or 'none' " +
        "(default) for the workspace total only."
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_RESULTS)
    .optional()
    .describe(
      `When grouping, the maximum number of rows to return ` +
        `(default ${DEFAULT_RESULTS}, max ${MAX_RESULTS}).`
    ),
};

const getCreditTimeseriesSchema = {
  ...timeWindowSchemaShape,
  ...usageFilterSchema,
  granularity: z
    .enum(["day", "week", "month"])
    .optional()
    .describe("Bucket granularity for the credit trend (default day)."),
  breakdownBy: z
    .enum(["agent", "user"])
    .optional()
    .describe(
      "Split each bucket into the top agents or users by credits, plus an " +
        "'other' series for the rest. Omit for a single total-credits trend."
    ),
  breakdownLimit: z
    .number()
    .int()
    .positive()
    .max(MAX_CREDIT_GROUPS)
    .optional()
    .describe(
      `Number of top groups to break out when breakdownBy is set ` +
        `(default ${DEFAULT_CREDIT_GROUPS}, max ${MAX_CREDIT_GROUPS}); the ` +
        `remainder is folded into 'other'.`
    ),
};

const getUsageTimeseriesSchema = {
  ...timeWindowSchemaShape,
  ...usageFilterSchema,
  metric: z
    .enum(["messages", "skills", "tools"])
    .optional()
    .describe(
      "What to plot over time. 'messages' (default): messages, conversations " +
        "and active users. 'skills'/'tools': executions and unique users."
    ),
  granularity: z
    .enum(["day", "week"])
    .optional()
    .describe(
      "Bucket granularity (default day). Only applies to the messages metric; " +
        "skills and tools are always daily."
    ),
};

export const WORKSPACE_ANALYTICS_TOOLS_METADATA = createToolsRecord({
  get_top_agents: {
    description:
      "Return the workspace's agents over a time window (defaults to the " +
      "current calendar month), ranked by number of messages, with the number " +
      "of unique users for each. Each row includes the agent's id. Optionally " +
      "filter by source (context_origin), agent, or user. Use this to answer " +
      "which agents are used most. Admin-only.",
    schema: getTopAgentsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top agents",
      done: "Retrieved top agents",
    },
  },
  get_top_users: {
    description:
      "Return the workspace's most active users over a time window (defaults " +
      "to the current calendar month), ranked by number of messages sent, " +
      "with the count of distinct agents each used. Each row includes the " +
      "user's id. Optionally filter by source (context_origin), agent, or " +
      "user. Use this to answer who the most active users are. Admin-only.",
    schema: getTopUsersSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top users",
      done: "Retrieved top users",
    },
  },
  get_agent_details: {
    description:
      "Return an agent's full configuration: name, description, scope, model, " +
      "equipped skills and tools, and its complete instructions (system " +
      "prompt). Use this after a usage tool to explain what a heavily-used " +
      "agent actually does. Takes the agent id returned by other tools. " +
      "Admin-only.",
    schema: getAgentDetailsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving agent details",
      done: "Retrieved agent details",
    },
  },
  get_top_skills: {
    description:
      "Return the workspace's most-used skills over a time window (defaults " +
      "to the current calendar month), ranked by execution count. Optionally " +
      "filter by source (context_origin), agent, or user. Use this to answer " +
      "which skills are used most. Admin-only.",
    schema: getTopSkillsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top skills",
      done: "Retrieved top skills",
    },
  },
  get_top_tools: {
    description:
      "Return the workspace's most-used tools (by MCP server) over a time " +
      "window (defaults to the current calendar month), ranked by execution " +
      "count. Optionally filter by source (context_origin), agent, or user. " +
      "Use this to answer which tools are used most. Admin-only.",
    schema: getTopToolsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top tools",
      done: "Retrieved top tools",
    },
  },
  get_source_breakdown: {
    description:
      "Return the workspace's message volume broken down by source — where " +
      "messages originate (Conversation, Slack, API, Trigger, extension, and " +
      "more) — over a time window (defaults to the current calendar month), " +
      "most used first. Sources are labeled and merged exactly as the " +
      "workspace Usage page's source chart, so the values line up with the " +
      "dashboard. Use this to discover and compare which channels or " +
      "integrations drive usage (including programmatic ones like API and " +
      "triggers) — the source filter on the other tools only narrows to one " +
      "source, this enumerates them all. Optionally filter by agent or user. " +
      "Admin-only.",
    schema: getSourceBreakdownSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving source breakdown",
      done: "Retrieved source breakdown",
    },
  },
  get_credit_usage: {
    description:
      "Estimate AWU credit consumption over a time window (defaults to the " +
      "current calendar month), optionally broken down by the top agents or " +
      "users. Credits combine model compute and tool usage, mirroring how " +
      "billing computes them. IMPORTANT: these figures are ESTIMATES derived " +
      "from usage logs — always tell the user they are approximate and point " +
      "them to the workspace Usage page for exact, billed credit amounts. " +
      "Optionally filter by source (context_origin), agent, or user. " +
      "Admin-only.",
    schema: getCreditUsageSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Estimating credit usage",
      done: "Estimated credit usage",
    },
  },
  get_credit_timeseries: {
    description:
      "Return estimated AWU credit consumption as a time series over a window " +
      "(defaults to the last 30 days), bucketed by day, week, or month. Set " +
      "breakdownBy to split each " +
      "bucket into the top agents or users plus an 'other' series (a stacked " +
      "trend). Use this for credit/spend TRENDS over time; use get_credit_usage " +
      "for a single window's totals and top agent/user attribution. IMPORTANT: " +
      "these figures are ESTIMATES — always tell the user they are approximate " +
      "and point them to the workspace Usage page for exact, billed credit " +
      "amounts. Chart the result. Optionally filter by source (context_origin), " +
      "agent, or user. Admin-only.",
    schema: getCreditTimeseriesSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Estimating credit trend",
      done: "Estimated credit trend",
    },
  },
  get_usage_timeseries: {
    description:
      "Return a usage time series over a window (defaults to the last 30 " +
      "days). The metric parameter selects what is plotted: messages " +
      "(messages/conversations/active users, default), skills, or tools " +
      "(executions/unique users). Use this for any trend over time — it is a " +
      "single call, do not call other tools once per day. Combine with the " +
      "source/agent/user filters to narrow. Chart the result. Admin-only.",
    schema: getUsageTimeseriesSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving usage time series",
      done: "Retrieved usage time series",
    },
  },
});

export const WORKSPACE_ANALYTICS_SERVER = {
  serverInfo: {
    name: "workspace_analytics",
    version: "1.0.0",
    description:
      "Answer workspace usage questions for admins (top agents, and more to " +
      "come).",
    icon: "ActionPieChartIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: Object.values(WORKSPACE_ANALYTICS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(WORKSPACE_ANALYTICS_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
