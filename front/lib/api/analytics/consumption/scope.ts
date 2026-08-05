import type { estypes } from "@elastic/elasticsearch";

/**
 * What a consumption query is scoped to (workspace, window, dimension filters)
 * and what it aggregates (the metric). Shared by every endpoint reading
 * `front.agent_message_consumption_analytics`.
 */

export const COMPLETED_AT_FIELD = "completed_at";

// Dimensions a consumption query can be sliced by. The same list serves both
// purposes: anything the query can be filtered on, it can also be broken down
// by. Every one of them maps to a single keyword field, so filtering is always a
// term/terms clause and breaking down is always a terms aggregation.
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

// Quantity a consumption query sums. Gross credits only for now — the index
// carries other summable fields (the net `credit_micro`, the token counts, the
// per-bucket gross splits) and this is where they get exposed when a caller
// needs them.
export const CONSUMPTION_METRICS = ["gross_credits"] as const;

export type ConsumptionMetric = (typeof CONSUMPTION_METRICS)[number];

export const DEFAULT_CONSUMPTION_METRIC: ConsumptionMetric = "gross_credits";

// Credits are indexed as micro-credits so they stay integers; everything else
// the index sums is already in its final unit and takes a divisor of 1.
const MICRO_CREDITS_PER_CREDIT = 1_000_000;

export const CONSUMPTION_METRIC_DEFINITIONS: Record<
  ConsumptionMetric,
  {
    field: string;
    // Applied to the raw Elasticsearch sum to get the unit the API reports.
    divisor: number;
  }
> = {
  gross_credits: {
    field: "gross_credit_micro.total",
    divisor: MICRO_CREDITS_PER_CREDIT,
  },
};

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
  workspaceId,
  startDate,
  endDate,
  filter = {},
  extraFilters = [],
}: {
  workspaceId: string;
  startDate: string;
  endDate: string;
  filter?: ConsumptionScopeFilter;
  extraFilters?: estypes.QueryDslQueryContainer[];
}): estypes.QueryDslQueryContainer {
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
