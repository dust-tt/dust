import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DEFAULT_CREDIT_GROUPS,
  DEFAULT_RESULTS,
  MAX_CREDIT_GROUPS,
  MAX_RESULTS,
  timeWindowSchemaShape,
  usageFilterSchema,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { z } from "zod";

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
const getTopAgentTagsSchema = topListSchema("agent tags");
const getTopModelsSchema = topListSchema("models");

const getSourceBreakdownSchema = {
  ...timeWindowSchemaShape,
  agentIds: usageFilterSchema.agentIds,
  userIds: usageFilterSchema.userIds,
  agentTagIds: usageFilterSchema.agentTagIds,
  modelIds: usageFilterSchema.modelIds,
};

const getAgentDetailsSchema = {
  agentId: z
    .string()
    .describe(
      "The agent's id (sId), as returned by get_top_agents_by_message_count or other tools."
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

// Consumption ("by credits") tools mirror the workspace Analytics page, which
// ranks every dimension by billed credits. They take the same window/filter
// inputs as the activity tools so a model can pivot between the two views.
const byCreditsSchema = (entityPlural: string) => ({
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

const getConsumptionOverviewSchema = {
  ...timeWindowSchemaShape,
  ...usageFilterSchema,
};

export const WORKSPACE_ANALYTICS_TOOLS_METADATA = [
  {
    name: "get_top_agents_by_message_count",
    description:
      "Return the workspace's most-used and most active agents over a time " +
      "window (defaults to the current calendar month), ranked by message " +
      "count, with unique user count for each. Each row includes the agent's " +
      "id. Use this to answer which agents are most popular, most used, or " +
      "most active. Admin-only.",
    schema: getTopAgentsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top agents",
      done: "Retrieved top agents",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_users_by_message_count",
    description:
      "Return the workspace's most active users and members over a time " +
      "window (defaults to the current calendar month), ranked by number of " +
      "messages sent, with the count of distinct agents each used. Each row " +
      "includes the user's id. Use this to answer who the most active users " +
      "are, rank members by usage, or find your top contributors. Admin-only.",
    schema: getTopUsersSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top users",
      done: "Retrieved top users",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_agent_tags_by_message_count",
    description:
      "List the agent tags applied across the workspace over a time window " +
      "(defaults to the current calendar month), ranked by message volume, " +
      "with the number of distinct agents bearing each tag. Each row includes " +
      "the tag's id. Use this to enumerate which agent tags exist and obtain " +
      "their ids, then supply those ids as the agentTagIds filter on the " +
      "other analytics tools. Because an agent can bear several tags, per-tag " +
      "counts overlap and may exceed the workspace total. Tags are fetched " +
      "based on historical message data and may not reflect current agent tags. Admin-only.",
    schema: getTopAgentTagsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top agent tags",
      done: "Retrieved top agent tags",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_models_by_message_count",
    description:
      "List which LLM models (Claude, GPT, Gemini, ...) answered messages over " +
      "a time window (defaults to the current calendar month), ranked by " +
      "message volume, with each model's provider and its distinct agent and " +
      "user counts. Use this to answer which model is used most, and to " +
      "discover the model ids to pass as the modelIds filter of the other " +
      "analytics tools; for credits per model use get_credit_usage with " +
      "groupBy 'model'. Models come from historical message data, so retired " +
      "models may appear. Admin-only.",
    schema: getTopModelsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top models",
      done: "Retrieved top models",
    },
    toolCostCategory: "basic",
    freeUsage: false,
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
    displayLabels: {
      running: "Retrieving agent details",
      done: "Retrieved agent details",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_skills_by_execution_count",
    description:
      "Return the workspace's most-used skills over a time window (defaults " +
      "to the current calendar month), ranked by execution count. Optionally " +
      "filter by source (context_origin), agent, user, tag, or model. Use this " +
      "to answer which skills are used most. Admin-only.",
    schema: getTopSkillsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top skills",
      done: "Retrieved top skills",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_tools_by_execution_count",
    description:
      "Return the workspace's most-used MCP tools and integrations over a " +
      "time window (defaults to the current calendar month), ranked by " +
      "execution count. Shows which MCP server tools are called most. Optionally " +
      "filter by source (context_origin), agent, user, tag, or model. Use this " +
      "to answer which tools are used most or which integrations agents " +
      "rely on. Admin-only.",
    schema: getTopToolsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top tools",
      done: "Retrieved top tools",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_sources_by_message_count",
    description:
      "Return the workspace's message volume broken down by source — where " +
      "messages originate (Conversation, Slack, API, Trigger, extension, and " +
      "more) — over a time window (defaults to the current calendar month), " +
      "most used first. Sources are labeled and merged exactly as the " +
      "workspace Usage page's source chart, so the values line up with the " +
      "dashboard. Use this to discover and compare which channels or " +
      "integrations drive usage (including programmatic ones like API and " +
      "triggers) — the source filter on the other tools only narrows to one " +
      "source, this enumerates them all. Optionally filter by agent, user, " +
      "tag, or model. Admin-only.",
    schema: getSourceBreakdownSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving source breakdown",
      done: "Retrieved source breakdown",
    },
    toolCostCategory: "basic",
    freeUsage: false,
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
    displayLabels: {
      running: "Estimating credit usage",
      done: "Estimated credit usage",
    },
    toolCostCategory: "basic",
    freeUsage: false,
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
    displayLabels: {
      running: "Estimating credit trend",
      done: "Estimated credit trend",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_activity_timeseries",
    description:
      "Return a usage time series over a window (defaults to the last 30 " +
      "days). Plot message volume (messages, conversations, active users), " +
      "skill executions, or tool calls over time. Use this for any activity " +
      "or usage trend — it is a single call, do not call other tools once per " +
      "day. Combine with filters to narrow. Chart the result. Admin-only.",
    schema: getUsageTimeseriesSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving usage time series",
      done: "Retrieved usage time series",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  // ---------------------------------------------------------------------------
  // STUBS — consumption ("by credits") tools.
  //
  // These mirror the workspace Analytics page 1:1: every one maps to an existing
  // `lib/api/analytics/consumption/*` fetcher, all of which already rank by
  // billed credits over the consumption index. Implementing them is a thin
  // adapter, not new aggregation work. Handlers are not wired yet.
  // ---------------------------------------------------------------------------
  {
    name: "get_top_agents_by_credits",
    description:
      "Return the agents that consumed the most credits over a time window, " +
      "with each agent's message count and average credits per message. This " +
      "is the ranking the workspace Analytics page shows. Use this for spend " +
      "questions; use get_top_agents_by_message_count for volume. Admin-only.",
    schema: byCreditsSchema("agents"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top agents by credits",
      done: "Retrieved top agents by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_users_by_credits",
    description:
      "Return the members who consumed the most credits over a time window, " +
      "with each member's message count and average credits per message. " +
      "Consumption with no member behind it (programmatic runs, triggers) " +
      "carries no user, so rows do not add up to the workspace total. " +
      "Admin-only.",
    schema: byCreditsSchema("members"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top members by credits",
      done: "Retrieved top members by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_models_by_credits",
    description:
      "Return the LLM models that consumed the most credits over a time " +
      "window, with each model's message count and average credits per " +
      "message. A message can pass through several models, so per-model " +
      "message counts overlap. Admin-only.",
    schema: byCreditsSchema("models"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top models by credits",
      done: "Retrieved top models by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_skills_by_credits",
    description:
      "Return the skills that consumed the most credits over a time window, " +
      "with each skill's tool-call count and average credits per call. A tool " +
      "call attributed to several skills is credited to each, so rows can " +
      "exceed the total. Admin-only.",
    schema: byCreditsSchema("skills"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top skills by credits",
      done: "Retrieved top skills by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_tools_by_credits",
    description:
      "Return the MCP tools and integrations that consumed the most credits " +
      "over a time window, with each tool's call count and average credits " +
      "per call. Tool credits cover the direct charge and the result's " +
      "context footprint, not the surrounding model work, so they do not sum " +
      "to the workspace total. Admin-only.",
    schema: byCreditsSchema("tools"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top tools by credits",
      done: "Retrieved top tools by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_sources_by_credits",
    description:
      "Return the sources (Conversation, Slack, API, Trigger, and more) that " +
      "consumed the most credits over a time window, with each source's " +
      "message count. The source value on each row is exactly what the " +
      "`source` filter of the other tools takes. Admin-only.",
    schema: byCreditsSchema("sources"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top sources by credits",
      done: "Retrieved top sources by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_api_keys_by_credits",
    description:
      "Return the API keys that consumed the most credits over a time " +
      "window, with each key's message count. Use this to attribute " +
      "programmatic spend to a specific integration. Admin-only.",
    schema: byCreditsSchema("API keys"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top API keys by credits",
      done: "Retrieved top API keys by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_groups_by_credits",
    description:
      "Return the member groups that consumed the most credits over a time " +
      "window, with each group's message count. A member can belong to " +
      "several groups, so per-group figures overlap. Admin-only.",
    schema: byCreditsSchema("groups"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top groups by credits",
      done: "Retrieved top groups by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_top_conversations_by_credits",
    description:
      "Return the conversations that consumed the most credits over a time " +
      "window, with each conversation's title. Use this to find unusually " +
      "expensive individual conversations. Admin-only.",
    schema: byCreditsSchema("conversations"),
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top conversations by credits",
      done: "Retrieved top conversations by credits",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "get_consumption_overview",
    description:
      "Return the workspace's headline consumption figures for a time " +
      "window: total credits, active and total members, the top agent, and " +
      "the credit cap status. This is the summary shown at the top of the " +
      "workspace Analytics page. Use this to answer 'how are we doing this " +
      "month' in one call. Admin-only.",
    schema: getConsumptionOverviewSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving consumption overview",
      done: "Retrieved consumption overview",
    },
    toolCostCategory: "basic",
    freeUsage: false,
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
