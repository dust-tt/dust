import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  consumptionFilterSchema,
  DEFAULT_CREDIT_GROUPS,
  DEFAULT_RESULTS,
  MAX_CREDIT_GROUPS,
  MAX_RESULTS,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { ConsumptionPeriodSchema } from "@app/lib/api/analytics/consumption/schema";
import {
  CONSUMPTION_INVOCATION_DIMENSIONS,
  CONSUMPTION_MESSAGE_DIMENSIONS,
  CONSUMPTION_SCOPE_DIMENSIONS,
  CONSUMPTION_TOP_DIMENSIONS,
} from "@app/lib/api/analytics/consumption/scope";
import { timezoneSchema } from "@app/lib/api/timezone";
import { z } from "zod";

export const GET_TOP_ENTITIES_BY_CREDITS_TOOL_NAME =
  "get_top_entities_by_credits" as const;

export const WORKSPACE_ANALYTICS_SERVER_NAME = "workspace_analytics" as const;

const getAgentDetailsSchema = {
  agentId: z
    .string()
    .describe("The agent's id (sId), as returned by the ranking tools."),
};

const consumptionPeriodSchemaShape = {
  period: ConsumptionPeriodSchema.shape.period.describe(
    "Time window: 'cycle' (default) covers the workspace's current billing " +
      "cycle, 'days' covers the last N days."
  ),
  days: ConsumptionPeriodSchema.shape.days.describe(
    "Number of days the window spans when period is 'days' (default 30). " +
      "Ignored for 'cycle'."
  ),
};

const getConsumptionOverviewSchema = {
  ...consumptionPeriodSchemaShape,
  ...consumptionFilterSchema,
};

const getCreditTimeseriesSchema = {
  ...consumptionPeriodSchemaShape,
  ...consumptionFilterSchema,
  timezone: timezoneSchema.describe(
    "IANA timezone used to align the buckets. Defaults to UTC."
  ),
  granularity: z
    .enum(["day", "week", "month"])
    .optional()
    .default("day")
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
export const GET_CREDIT_TIMESERIES_TOOL_NAME = "get_credit_timeseries" as const;

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
  ...consumptionPeriodSchemaShape,
  ...consumptionFilterSchema,
  limit: rankingLimitSchema,
};

const getTopEntitiesByMessageCountSchema = {
  dimension: z
    .enum(CONSUMPTION_MESSAGE_DIMENSIONS)
    .describe(GROUP_BY_DESCRIPTION),
  ...consumptionPeriodSchemaShape,
  ...consumptionFilterSchema,
  limit: rankingLimitSchema,
};

const getTopEntitiesByExecutionCountSchema = {
  dimension: z
    .enum(CONSUMPTION_INVOCATION_DIMENSIONS)
    .describe(GROUP_BY_DESCRIPTION),
  ...consumptionPeriodSchemaShape,
  ...consumptionFilterSchema,
  limit: rankingLimitSchema,
};

export const WORKSPACE_ANALYTICS_TOOLS_METADATA = [
  {
    name: GET_TOP_ENTITIES_BY_MESSAGE_COUNT_TOOL_NAME,
    description:
      "Rank the workspace's entities by message count over a time period.",
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
      "Rank the workspace's skills, MCP tools and integrations by execution " +
      "count over a time period.",
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
      "Return an agent's full configuration, equipped skills and tools, " +
      "and its complete instructions.",
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
      "Summarize the workspace's headline figures over a time period.",
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
    name: GET_CREDIT_TIMESERIES_TOOL_NAME,
    description:
      "Return credit consumption as a time series over a time period.",
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
      "Rank the workspace's entities by credits spent over a time period.",
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
    name: WORKSPACE_ANALYTICS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Workspace usage analytics for admins and managers: credit consumption, " +
      "message and execution volume by entity, headline figures, and trends " +
      "over time.",
    icon: "ActionPieChartIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: WORKSPACE_ANALYTICS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
