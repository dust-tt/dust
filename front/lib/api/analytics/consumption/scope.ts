import type { Authenticator } from "@app/lib/auth";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import type { estypes } from "@elastic/elasticsearch";

export const COMPLETED_AT_FIELD = "completed_at";

export const AGENT_MESSAGE_ID_FIELD = "agent_message_id";

export const CONVERSATION_ID_FIELD = "conversation_id";

export const TRIGGER_ID_FIELD = "trigger_id";

export const CARDINALITY_PRECISION_THRESHOLD = 40_000;

export const CONSUMPTION_SCOPE_DIMENSIONS = [
  "agent",
  "user",
  "api_key",
  "group",
  "model",
  "tool",
  "skill",
  "source",
] as const;

export type ConsumptionScopeDimension =
  (typeof CONSUMPTION_SCOPE_DIMENSIONS)[number];

export const CONSUMPTION_DIMENSION_FIELDS: Record<
  ConsumptionScopeDimension,
  string
> = {
  agent: "agent.id",
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

export const CONSUMPTION_SCOPE_FILTER_KEYS = [
  "agents",
  "users",
  "api_keys",
  "groups",
  "models",
  "tools",
  "skills",
  "sources",
] as const;

export type ConsumptionScopeFilterKey =
  (typeof CONSUMPTION_SCOPE_FILTER_KEYS)[number];

export type ConsumptionScopeFilter = Partial<
  Record<ConsumptionScopeFilterKey, string[]>
>;

export const CONSUMPTION_DIMENSION_FILTER_KEYS: Record<
  ConsumptionScopeDimension,
  ConsumptionScopeFilterKey
> = {
  agent: "agents",
  user: "users",
  api_key: "api_keys",
  group: "groups",
  model: "models",
  tool: "tools",
  skill: "skills",
  source: "sources",
};

export const CONSUMPTION_TOP_SORT_ORDER = ["asc", "desc"] as const;

export type ConsumptionTopSortOrder =
  (typeof CONSUMPTION_TOP_SORT_ORDER)[number];

// A terms aggregation cannot order its buckets by a pipeline aggregation
// (confirmed against a live cluster: "is a pipeline aggregation and cannot
// be used to sort the buckets"), so a ratio like avg credits per unit can't be
// ranked with a bucket_script the way gross credits is. Two metrics avoid
// that:
// - "credits" orders by the sum(credit_micro) metric directly. Cost share is
//   credits divided by the same totalCredits for every row, so it rides this
//   same ranking (see ATTRIBUTION_SERVER_SORTABLE_COLUMN_IDS in
//   ConsumptionAttributionTable.tsx).
// - "avgCredits" orders by average credits per unit. For "invocation"
//   dimensions (tool, skill) that unit is the document itself, so a plain
//   avg(credit_micro) metric already equals credits-per-invocation. For
//   "message" dimensions it isn't: several documents (one per LLM run, one
//   per tool action) can share a message, so the average needs a
//   scripted_metric to divide the summed credits by the count of *distinct*
//   message ids in the bucket — the "real complexity" previously left for a
//   follow-up. See AVG_CREDIT_PER_MESSAGE_AGG in top.ts.
export const CONSUMPTION_TOP_SORT_BY = ["credits", "avgCredits"] as const;

export type ConsumptionTopSortBy = (typeof CONSUMPTION_TOP_SORT_BY)[number];

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

  return { bool: { filter: [...filters, ...extraFilters] } };
}
