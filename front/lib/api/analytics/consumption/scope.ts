import type { estypes } from "@elastic/elasticsearch";

const MICRO_CREDITS_PER_CREDIT = 1_000_000;

export const CREDIT_MICRO_FIELD = "credit_micro";
export const COMPLETED_AT_FIELD = "completed_at";
export const AGENT_MESSAGE_ID_FIELD = "agent_message_id";

// Dimensions a consumption query can be filtered by. Every one of them maps to
// a single keyword field, so filtering is always a term/terms clause.
export const CONSUMPTION_SCOPE_DIMENSIONS = [
  "agent",
  "member",
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
  member: "user.id",
  model: "model.model_id",
  tool: "tool.server_name",
  skill: "tool.attributed_skill_ids",
  source: "context_origin",
};

export type ConsumptionScopeFilter = Partial<
  Record<ConsumptionScopeDimension, string[]>
>;

export function creditsFromMicroCredits(microCredits: number): number {
  return microCredits / MICRO_CREDITS_PER_CREDIT;
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
