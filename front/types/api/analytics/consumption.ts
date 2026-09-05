export const CONSUMPTION_FACET_SCOPES = ["all", "automations"] as const;

// Restricts which consumption documents facets are computed over. The
// automations page filters the same index down to trigger-originated runs, so
// its facets must count only those documents.
export type ConsumptionFacetScope = (typeof CONSUMPTION_FACET_SCOPES)[number];

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

// Bounds the `terms` clause each selected dimension turns into.
export const CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION = 500;

export const CONSUMPTION_SCOPE_FILTER_KEYS = [
  "agents",
  "users",
  "api_keys",
  "groups",
  "models",
  "tools",
  "skills",
  "sources",
  "tags",
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

export const CONSUMPTION_TOP_GROUP_SORT_BY = [
  "credits",
  "workspace_average",
] as const;

export type ConsumptionTopGroupSortBy =
  (typeof CONSUMPTION_TOP_GROUP_SORT_BY)[number];
