import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  consumptionFilterSchema,
  DEFAULT_CREDIT_GROUPS,
  DEFAULT_RESULTS,
  MAX_CREDIT_GROUPS,
  MAX_RESULTS,
  timeWindowSchemaShape,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { ConsumptionPeriodSchema } from "@app/lib/api/analytics/consumption/schema";
import {
  CONSUMPTION_INVOCATION_DIMENSIONS,
  CONSUMPTION_MESSAGE_DIMENSIONS,
  CONSUMPTION_SCOPE_DIMENSIONS,
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

const getConsumptionOverviewSchema = {
  ...ConsumptionPeriodSchema.shape,
  ...consumptionFilterSchema,
};

const getCreditTimeseriesSchema = {
  ...timeWindowSchemaShape,
  ...consumptionFilterSchema,
  granularity: z
    .enum(["day", "week", "month"])
    .optional()
    .describe("Bucket granularity for the credit trend (default day)."),
  breakdownBy: z
    .enum(CONSUMPTION_SCOPE_DIMENSIONS)
    .optional()
    .describe(
      "Split each bucket by this dimension — its top groups plus an 'others' " +
        "series for the rest. Omit for a single total-credits trend."
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
        `remainder is folded into 'others'.`
    ),
};

export const GET_TOP_ENTITIES_BY_MESSAGE_COUNT_TOOL_NAME =
  "get_top_entities_by_message_count" as const;
export const GET_TOP_ENTITIES_BY_EXECUTION_COUNT_TOOL_NAME =
  "get_top_entities_by_execution_count" as const;
export const GET_CONSUMPTION_OVERVIEW_TOOL_NAME =
  "get_consumption_overview" as const;

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
      running: "Retrieving top entities by message count",
      done: "Retrieved top entities by message count",
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
      running: "Retrieving top entities by execution count",
      done: "Retrieved top entities by execution count",
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
    name: GET_CONSUMPTION_OVERVIEW_TOOL_NAME,
    description:
      "Summarize the workspace's headline figures for the current billing " +
      "cycle, or the last N days: total credits consumed, messages, active " +
      "and total members, and the top agent. Use this to answer 'how are we " +
      "doing this cycle' or 'how many credits did we consume' in one call, " +
      `and ${GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME} to attribute that total.`,
    schema: getConsumptionOverviewSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving consumption overview",
      done: "Retrieved consumption overview",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "get_credit_timeseries",
    description:
      "Return credit consumption as a time series over a window (defaults to " +
      "the last 30 days), bucketed by day, week or month. Use this to answer " +
      "'is credit spend trending up or down' or 'which week had the highest " +
      `spend'. For a single window use ${GET_CONSUMPTION_OVERVIEW_TOOL_NAME} ` +
      `for the total and ${GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME} for the ` +
      "breakdown. Chart the result.",
    schema: getCreditTimeseriesSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving credit trend",
      done: "Retrieved credit trend",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME,
    description:
      "Rank the workspace's credit consumption by entity " +
      "over a time window (defaults to the current calendar month). Use " +
      "this to break credit spending down by agent, or to answer 'which " +
      "agent costs the most' or 'which conversation was most expensive', " +
      "or to attribute credit spend by API key, tag, or model. Figures " +
      "are billed credits. Rows may overlap, so don't sum them for a " +
      "workspace total.",
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
