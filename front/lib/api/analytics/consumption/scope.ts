import type { Authenticator } from "@app/lib/auth";
import type { estypes } from "@elastic/elasticsearch";

export const COMPLETED_AT_FIELD = "completed_at";

export const AGENT_MESSAGE_ID_FIELD = "agent_message_id";

export const CONSUMPTION_SCOPE_DIMENSIONS = [
  "agent",
  "user",
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
  model: "model.model_id",
  tool: "tool.server_name",
  // Multi-valued: one tool call can be attributed to several skills at once.
  skill: "tool.attributed_skill_ids",
  source: "context_origin",
};

export type ConsumptionScopeFilter = Partial<
  Record<ConsumptionScopeDimension, string[]>
>;

export const CONSUMPTION_METRICS = ["gross_credits"] as const;

export type ConsumptionMetric = (typeof CONSUMPTION_METRICS)[number];

export const DEFAULT_CONSUMPTION_METRIC: ConsumptionMetric = "gross_credits";

const MICRO_CREDITS_PER_CREDIT = 1_000_000;

export function creditsFromMicroCredits(microCredits: number): number {
  return microCredits / MICRO_CREDITS_PER_CREDIT;
}

export const GROSS_CREDIT_MICRO_FIELD = "gross_credit_micro.total";

export const CONSUMPTION_METRIC_DEFINITIONS: Record<
  ConsumptionMetric,
  {
    field: string;
    // Applied to the raw Elasticsearch sum to get the unit the API reports.
    divisor: number;
  }
> = {
  gross_credits: {
    field: GROSS_CREDIT_MICRO_FIELD,
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
      ...termFilter(CONSUMPTION_DIMENSION_FIELDS[dimension], filter[dimension])
    );
  }

  return { bool: { filter: [...filters, ...extraFilters] } };
}
