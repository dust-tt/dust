import type { Authenticator } from "@app/lib/auth";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/types/api/analytics/consumption";
import {
  CONSUMPTION_DIMENSION_FILTER_KEYS,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/types/api/analytics/consumption";
import type { estypes } from "@elastic/elasticsearch";

export type {
  ConsumptionFacetScope,
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
  ConsumptionScopeFilterKey,
  ConsumptionTopGroupSortBy,
  ConsumptionTopSortOrder,
} from "@app/types/api/analytics/consumption";
export {
  CONSUMPTION_DIMENSION_FILTER_KEYS,
  CONSUMPTION_FACET_SCOPES,
  CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION,
  CONSUMPTION_SCOPE_DIMENSIONS,
  CONSUMPTION_SCOPE_FILTER_KEYS,
  CONSUMPTION_TOP_GROUP_SORT_BY,
  CONSUMPTION_TOP_SORT_ORDER,
} from "@app/types/api/analytics/consumption";

export const COMPLETED_AT_FIELD = "completed_at";

export const AGENT_MESSAGE_ID_FIELD = "agent_message_id";

export const CONVERSATION_ID_FIELD = "conversation_id";

export const TRIGGER_ID_FIELD = "trigger_id";

export const CARDINALITY_PRECISION_THRESHOLD = 40_000;

// Upper bound on the number of buckets a terms aggregation over an export's
// full dimension (every agent, every user, ...) can return. Large enough that
// no real workspace hits it, so every value comes back in one page.
export const MAX_EXPORT_TERMS_SIZE = 10_000;

// Consumption documents are split per LLM step and per tool call, so a
// message contributes several documents to the same bucket: dedupe by
// agent_message_id to count distinct messages, at the same precision as the
// rest of the consumption module's cardinality aggregations.
export function uniqueMessagesCardinalityAgg(): estypes.AggregationsAggregationContainer {
  return {
    cardinality: {
      field: AGENT_MESSAGE_ID_FIELD,
      precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
    },
  };
}

// The scope dimensions plus the two that can be ranked but not filtered on, and
// are therefore not scope dimensions: conversation, and the agent tag a
// document inherits from the agent that produced it.
export const CONSUMPTION_TOP_DIMENSIONS = [
  ...CONSUMPTION_SCOPE_DIMENSIONS,
  "conversation",
  "tag",
  "reasoning_effort",
] as const;

export type ConsumptionTopDimension =
  (typeof CONSUMPTION_TOP_DIMENSIONS)[number];

export const CONSUMPTION_DIMENSION_FIELDS: Record<
  ConsumptionScopeDimension,
  string
> = {
  agent: "agent.attributed_id",
  user: "user.id",
  api_key: "api_key_name",
  // Multi-valued: a member can belong to several groups at once.
  group: "user.group_ids",
  model: "model.model_id",
  tool: "tool.server_name",
  // Multi-valued: one tool call can be attributed to several skills at once.
  skill: "tool.attributed_skill_ids",
  source: "normalized_origin",
};

export const AGENT_TAG_IDS_FIELD = "agent.tag_ids";

export const CONSUMPTION_TOP_DIMENSION_FIELDS: Record<
  ConsumptionTopDimension,
  string
> = {
  ...CONSUMPTION_DIMENSION_FIELDS,
  conversation: CONVERSATION_ID_FIELD,
  // Multi-valued: an agent can carry several tags at once.
  tag: AGENT_TAG_IDS_FIELD,
  reasoning_effort: "model.reasoning_effort",
};

export type ConsumptionTopUnit = "message" | "invocation";

export const CONSUMPTION_DIMENSION_UNIT: Record<
  ConsumptionScopeDimension,
  ConsumptionTopUnit
> = {
  agent: "message",
  user: "message",
  api_key: "message",
  group: "message",
  model: "message",
  tool: "invocation",
  skill: "invocation",
  source: "message",
};

export const CONSUMPTION_TOP_DIMENSION_UNIT: Record<
  ConsumptionTopDimension,
  ConsumptionTopUnit
> = {
  ...CONSUMPTION_DIMENSION_UNIT,
  conversation: "message",
  tag: "message",
  reasoning_effort: "message",
};

export const CONSUMPTION_TOP_RANK_BY = ["credits", "count"] as const;

export type ConsumptionTopRankBy = (typeof CONSUMPTION_TOP_RANK_BY)[number];

export const CONSUMPTION_MESSAGE_DIMENSIONS = [
  "agent",
  "user",
  "api_key",
  "group",
  "model",
  "source",
  "conversation",
  "tag",
  "reasoning_effort",
] as const;

export const CONSUMPTION_INVOCATION_DIMENSIONS = ["tool", "skill"] as const;

export const CONSUMPTION_METRICS = ["credit_micro"] as const;

export type ConsumptionMetric = (typeof CONSUMPTION_METRICS)[number];

export const DEFAULT_CONSUMPTION_METRIC: ConsumptionMetric = "credit_micro";

export const CREDIT_MICRO_FIELD = "credit_micro";

export const CONSUMPTION_METRIC_DEFINITIONS: Record<
  ConsumptionMetric,
  {
    field: string;
    // Applied to the raw Elasticsearch sum to get the unit the API reports.
    divisor: number;
  }
> = {
  credit_micro: {
    field: CREDIT_MICRO_FIELD,
    divisor: MICRO_CREDITS_PER_CREDIT,
  },
};

export type ConsumptionGroupBucket = {
  key: string;
  metric?: estypes.AggregationsSumAggregate;
};

export function metricSubAgg(
  metric: ConsumptionMetric
): Record<string, estypes.AggregationsAggregationContainer> {
  return {
    metric: { sum: { field: CONSUMPTION_METRIC_DEFINITIONS[metric].field } },
  };
}

export function metricValue(
  metric: ConsumptionMetric,
  agg: estypes.AggregationsSumAggregate | undefined
): number {
  return (agg?.value ?? 0) / CONSUMPTION_METRIC_DEFINITIONS[metric].divisor;
}

function termFilter(
  field: string,
  values: string[] | undefined
): estypes.QueryDslQueryContainer[] {
  if (!values) {
    return [];
  }
  const nonEmpty = values.filter((value) => value.length > 0);
  if (nonEmpty.length === 0) {
    return [];
  }
  return [
    nonEmpty.length === 1
      ? { term: { [field]: nonEmpty[0] } }
      : { terms: { [field]: nonEmpty } },
  ];
}

/**
 * Workspace-scoped query over a half-open [startDate, endDate) window.
 */
export function buildConsumptionScopeQuery({
  auth,
  startDate,
  endDate,
  filter = {},
  extraFilters = [],
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  filter?: ConsumptionScopeFilter;
  extraFilters?: estypes.QueryDslQueryContainer[];
}): estypes.QueryDslQueryContainer {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    { range: { [COMPLETED_AT_FIELD]: { gte: startDate, lt: endDate } } },
  ];

  for (const dimension of CONSUMPTION_SCOPE_DIMENSIONS) {
    filters.push(
      ...termFilter(
        CONSUMPTION_DIMENSION_FIELDS[dimension],
        filter[CONSUMPTION_DIMENSION_FILTER_KEYS[dimension]]
      )
    );
  }
  filters.push(...termFilter(AGENT_TAG_IDS_FIELD, filter.tags));

  return { bool: { filter: [...filters, ...extraFilters] } };
}
