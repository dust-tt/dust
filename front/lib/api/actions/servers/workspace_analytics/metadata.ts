import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  consumptionFilterSchema,
  DEFAULT_CREDIT_GROUPS,
  DEFAULT_RESULTS,
  MAX_CREDIT_GROUPS,
  MAX_RESULTS,
  timeWindowSchemaShape,
  usageFilterSchema,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import {
  CONSUMPTION_INVOCATION_DIMENSIONS,
  CONSUMPTION_MESSAGE_DIMENSIONS,
  CONSUMPTION_TOP_DIMENSIONS,
} from "@app/lib/api/analytics/consumption/scope";
import { z } from "zod";

export const GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME =
  "get_top_entities_by_credits" as const;

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
    .enum(["agent", "user", "model", "none"])
    .optional()
    .describe(
      "Break the estimated credits down by top 'agent', 'user' or 'model' " +
        "(the model that answered the message), or 'none' (default) for the " +
        "workspace total only."
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
    .enum(["agent", "user", "model"])
    .optional()
    .describe(
      "Split each bucket into the top agents, users or models by credits, " +
        "plus an 'other' series for the rest. Omit for a single total-credits " +
        "trend."
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

export const GET_TOP_ENTITIES_BY_MESSAGE_COUNT_TOOL_NAME =
  "get_top_entities_by_message_count" as const;
export const GET_TOP_ENTITIES_BY_EXECUTION_COUNT_TOOL_NAME =
  "get_top_entities_by_execution_count" as const;

const rankingLimitSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_RESULTS)
  .optional()
  .describe(
    `Maximum number of rows to return ` +
      `(default ${DEFAULT_RESULTS}, max ${MAX_RESULTS}).`
  );

const GROUP_BY_DESCRIPTION = "What to group results by.";

const getTopEntitiesByCreditsSchema = {
  dimension: z.enum(CONSUMPTION_TOP_DIMENSIONS).describe(GROUP_BY_DESCRIPTION),
  ...timeWindowSchemaShape,
  ...consumptionFilterSchema,
  limit: rankingLimitSchema,
};

const getTopEntitiesByMessageCountSchema = {
  dimension: z
    .enum(CONSUMPTION_MESSAGE_DIMENSIONS)
    .describe(GROUP_BY_DESCRIPTION),
  ...timeWindowSchemaShape,
  ...consumptionFilterSchema,
  limit: rankingLimitSchema,
};

const getTopEntitiesByExecutionCountSchema = {
  dimension: z
    .enum(CONSUMPTION_INVOCATION_DIMENSIONS)
    .describe(GROUP_BY_DESCRIPTION),
  ...timeWindowSchemaShape,
  ...consumptionFilterSchema,
  limit: rankingLimitSchema,
};

export const WORKSPACE_ANALYTICS_TOOLS_METADATA = [
  {
    name: GET_TOP_ENTITIES_BY_MESSAGE_COUNT_TOOL_NAME,
    description:
      "Rank the workspace's entities by message volume over a " +
      "time window (defaults to the current calendar month). Use this to " +
      "answer 'which user is most active this month', 'which agent is " +
      "used most', 'where do our messages come from, by source', or " +
      "'list the agent tags, most-used tags first'. Every value it " +
      "returns, including tag ids, can be fed back in as a filter on " +
      `any of these tools. Use ${GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME} ` +
      "to rank by cost.",
    schema: getTopEntitiesByMessageCountSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving top by message count",
      done: "Retrieved top by message count",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_TOP_ENTITIES_BY_EXECUTION_COUNT_TOOL_NAME,
    description:
      "Rank the workspace's skills, or its MCP tools and integrations, by how " +
      "many times they were executed over a time window (defaults to the " +
      "current calendar month). Use this to answer 'which are the top " +
      "tools agents used most' or 'which skill runs most often'. One " +
      "run attributed to several skills counts for each, so skill rows " +
      "overlap. Use " +
      `${GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME} to rank the same ` +
      "entities by cost instead.",
    schema: getTopEntitiesByExecutionCountSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving top by execution count",
      done: "Retrieved top by execution count",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "get_agent_details",
    description:
      "Return an agent's full configuration: name, description, scope, model, " +
      "equipped skills and capabilities, and its complete system prompt and " +
      "instructions. Use this to inspect what a heavily-used agent actually " +
      "does. Admin-only.",
    schema: getAgentDetailsSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving agent details",
      done: "Retrieved agent details",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "get_credit_usage",
    description:
      "Estimate AWU credit consumption over a time window (defaults to the " +
      "current calendar month), optionally broken down by the top agents, " +
      "users or models. Credits combine model compute and tool usage, " +
      "mirroring how billing computes them. IMPORTANT: these figures are " +
      "ESTIMATES derived from usage logs — always tell the user they are " +
      "approximate and point them to the workspace Usage page for exact, " +
      "billed credit amounts. Optionally filter by source (context_origin), " +
      "agent, user, tag, or model — e.g. filter by tag to attribute credits " +
      "to all agents with a given tag, or group by model to see which models " +
      "drive spend. Admin-only.",
    schema: getCreditUsageSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Estimating credit usage",
      done: "Estimated credit usage",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "get_credit_timeseries",
    description:
      "Return estimated AWU credit consumption as a time series over a window " +
      "(defaults to the last 30 days), bucketed by day, week, or month. Set " +
      "breakdownBy to split each " +
      "bucket into the top agents, users or models plus an 'other' series (a " +
      "stacked trend). Use this for credit/spend TRENDS over time; use " +
      "get_credit_usage for a single window's totals and top " +
      "agent/user/model attribution. IMPORTANT: " +
      "these figures are ESTIMATES — always tell the user they are approximate " +
      "and point them to the workspace Usage page for exact, billed credit " +
      "amounts. Chart the result. Optionally filter by source (context_origin), " +
      "agent, user, tag, or model. Admin-only.",
    schema: getCreditTimeseriesSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Estimating credit trend",
      done: "Estimated credit trend",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "get_usage_timeseries",
    description:
      "Return a usage time series over a window (defaults to the last 30 " +
      "days). Plot message volume (messages, conversations, active users), " +
      "skill executions, or tool calls over time. Use this for any activity " +
      "or usage trend — it is a single call, do not call other tools once per " +
      "day. Combine with filters to narrow. Chart the result. Admin-only.",
    schema: getUsageTimeseriesSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving usage time series",
      done: "Retrieved usage time series",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME,
    description:
      "Rank the workspace's credit consumption by entity " +
      "over a time window (defaults to the current calendar month). Use " +
      "this to answer 'which agent costs the most' or 'which " +
      "conversation was most expensive', or to attribute credit spend by " +
      "API key, tag, or model. Figures are billed credits. Rows may " +
      "overlap, so don't sum them for a workspace total.",
    schema: getTopEntitiesByCreditsSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving top consumers",
      done: "Retrieved top consumers",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const WORKSPACE_ANALYTICS_SERVER = {
  serverInfo: {
    name: "workspace_analytics",
    version: "1.0.0",
    description:
      "Answer workspace usage questions for admins and managers (top agents, " +
      "and more to come).",
    icon: "ActionPieChartIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: WORKSPACE_ANALYTICS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
