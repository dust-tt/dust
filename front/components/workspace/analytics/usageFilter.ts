import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import {
  CONSUMPTION_DIMENSION_FILTER_KEYS,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/lib/api/analytics/consumption/scope";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { ConnectorProvider } from "@app/types/data_source";

export const USAGE_FILTER_CATEGORIES = [
  "agent",
  "member",
  "group",
  "model",
  "tool",
  "skill",
  "source",
  "api_key",
] as const;

export type UsageFilterCategory = (typeof USAGE_FILTER_CATEGORIES)[number];

export const USAGE_FILTER_CATEGORY_LABEL: Record<UsageFilterCategory, string> =
  {
    agent: "Agents",
    member: "Members",
    group: "Groups",
    model: "Models",
    tool: "Tools",
    skill: "Skills",
    source: "Sources",
    api_key: "API keys",
  };

export const USAGE_FILTER_CATEGORY_SINGULAR_LABEL: Record<
  UsageFilterCategory,
  string
> = {
  agent: "Agent",
  member: "Member",
  group: "Group",
  model: "Model",
  tool: "Tool",
  skill: "Skill",
  source: "Source",
  api_key: "API key",
};

// "member" maps to the "user" dimension; every other category maps directly
// to its same-named consumption dimension.
export const USAGE_FILTER_CATEGORY_BY_DIMENSION: Record<
  ConsumptionScopeDimension,
  UsageFilterCategory
> = {
  agent: "agent",
  user: "member",
  group: "group",
  model: "model",
  tool: "tool",
  skill: "skill",
  source: "source",
  api_key: "api_key",
};

export const USAGE_FILTER_AGENT_SCOPES = [
  ...AGENT_CONFIGURATION_SCOPES,
  "all",
] as const;

export type UsageFilterAgentScope = (typeof USAGE_FILTER_AGENT_SCOPES)[number];

export const USAGE_FILTER_SCOPE_LABEL: Record<UsageFilterAgentScope, string> = {
  global: "Company",
  visible: "Shared",
  hidden: "Private",
  all: "All",
};

interface UsageFilterOptionBase {
  id: string;
  name: string;
  disabled: boolean;
}

export interface UsageFilterAgentOption extends UsageFilterOptionBase {
  kind: "agent";
  // Historical agents remain filterable after their configuration disappears.
  scope?: AgentConfigurationScope;
  image: string | null;
}

export interface UsageFilterMemberOption extends UsageFilterOptionBase {
  kind: "member";
  image: string | null;
}

export interface UsageFilterGroupOption extends UsageFilterOptionBase {
  kind: "group";
}

export interface UsageFilterSourceOption extends UsageFilterOptionBase {
  kind: "source";
  connectorProvider: ConnectorProvider | undefined;
}

export interface UsageFilterModelOption extends UsageFilterOptionBase {
  kind: "model";
  lab?: ModelMakerIdType;
  // Undefined for a model outside the static tier table — it doesn't match
  // any Basic/Standard/Premium quick filter, so it's absent from the main
  // checklist but still reachable through the "More models" browse dropdown.
  tier: ModelsTierName | undefined;
}

export interface UsageFilterToolOption extends UsageFilterOptionBase {
  kind: "tool";
  icon: string | null;
}

export interface UsageFilterSkillOption extends UsageFilterOptionBase {
  kind: "skill";
  icon: string | null;
}

export interface UsageFilterApiKeyOption extends UsageFilterOptionBase {
  kind: "api_key";
}

export type UsageFilterOption =
  | UsageFilterAgentOption
  | UsageFilterMemberOption
  | UsageFilterGroupOption
  | UsageFilterSourceOption
  | UsageFilterModelOption
  | UsageFilterToolOption
  | UsageFilterSkillOption
  | UsageFilterApiKeyOption;

export interface UsageFilterGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export type UsageFilterOptionForCategory<C extends UsageFilterCategory> =
  Extract<UsageFilterOption, { kind: C }>;

// Ids only: names, avatars and scopes are re-resolved from the facets
// response, so a shared link never carries a stale name.
export type UsageFilter = Partial<Record<UsageFilterCategory, string[]>>;

export type UsageFilterOptionsByCategory = {
  [C in UsageFilterCategory]: UsageFilterOptionForCategory<C>[];
};

export type UsageFilterOptionIndex = Record<
  UsageFilterCategory,
  Map<string, UsageFilterOption>
>;

function toOptionIndex(
  options: UsageFilterOption[]
): Map<string, UsageFilterOption> {
  return new Map(options.map((option) => [option.id, option]));
}

export function indexUsageFilterOptions(
  options: UsageFilterOptionsByCategory
): UsageFilterOptionIndex {
  return {
    agent: toOptionIndex(options.agent),
    member: toOptionIndex(options.member),
    group: toOptionIndex(options.group),
    model: toOptionIndex(options.model),
    tool: toOptionIndex(options.tool),
    skill: toOptionIndex(options.skill),
    source: toOptionIndex(options.source),
    api_key: toOptionIndex(options.api_key),
  };
}

export interface UsageFilterSummary {
  category: UsageFilterCategory;
  categoryLabel: string;
  options: Array<{ id: string; name: string }>;
}

export function getUsageFilterSummaries(
  filter: UsageFilter,
  index: UsageFilterOptionIndex
): UsageFilterSummary[] {
  return USAGE_FILTER_CATEGORIES.flatMap((category) => {
    const ids = filter[category];
    if (!ids?.length) {
      return [];
    }

    return [
      {
        category,
        categoryLabel: USAGE_FILTER_CATEGORY_SINGULAR_LABEL[category],
        options: ids.map((id) => ({
          id,
          name: index[category].get(id)?.name ?? id,
        })),
      },
    ];
  });
}

// The panel's selection column needs the full option to draw an icon, so an
// id the current facets don't cover is left out of it.
export function resolveUsageFilterOptions(
  filter: UsageFilter,
  index: UsageFilterOptionIndex
): Partial<Record<UsageFilterCategory, UsageFilterOption[]>> {
  const resolved: Partial<Record<UsageFilterCategory, UsageFilterOption[]>> =
    {};

  for (const category of USAGE_FILTER_CATEGORIES) {
    const ids = filter[category];
    if (!ids?.length) {
      continue;
    }
    const options = ids.flatMap((id) => index[category].get(id) ?? []);
    if (options.length > 0) {
      resolved[category] = options;
    }
  }

  return resolved;
}

// An id that no longer resolves to a facet is a deleted entity with no traffic
// in the period. Returns null when there is nothing to drop.
export function pruneUsageFilter(
  filter: UsageFilter,
  index: UsageFilterOptionIndex
): UsageFilter | null {
  const pruned: UsageFilter = {};
  let hasDroppedId = false;

  for (const category of USAGE_FILTER_CATEGORIES) {
    const ids = filter[category];
    if (!ids?.length) {
      continue;
    }
    const keptIds = ids.filter((id) => index[category].has(id));
    if (keptIds.length !== ids.length) {
      hasDroppedId = true;
    }
    if (keptIds.length > 0) {
      pruned[category] = keptIds;
    }
  }

  return hasDroppedId ? pruned : null;
}

export function usageFilterSelectionCount(filter: UsageFilter): number {
  return USAGE_FILTER_CATEGORIES.reduce(
    (count, category) => count + (filter[category]?.length ?? 0),
    0
  );
}

export function toggleUsageFilterId(
  filter: UsageFilter,
  category: UsageFilterCategory,
  id: string
): UsageFilter {
  const current = filter[category] ?? [];
  const next = current.includes(id)
    ? current.filter((selectedId) => selectedId !== id)
    : [...current, id];
  return { ...filter, [category]: next.length > 0 ? next : undefined };
}

export function removeUsageFilterId(
  filter: UsageFilter,
  category: UsageFilterCategory,
  id: string
): UsageFilter {
  const next = (filter[category] ?? []).filter(
    (selectedId) => selectedId !== id
  );
  return { ...filter, [category]: next.length > 0 ? next : undefined };
}

export function clearUsageFilterCategory(
  filter: UsageFilter,
  category: UsageFilterCategory
): UsageFilter {
  return { ...filter, [category]: undefined };
}

export function addUsageFilterIds(
  filter: UsageFilter,
  category: UsageFilterCategory,
  ids: string[]
): UsageFilter {
  const current = filter[category] ?? [];
  const currentIds = new Set(current);
  const additions = ids.filter((id) => !currentIds.has(id));
  if (additions.length === 0) {
    return filter;
  }
  return { ...filter, [category]: [...current, ...additions] };
}

export function addUsageFilterDimensionId(
  filter: UsageFilter,
  dimension: ConsumptionScopeDimension,
  id: string
): UsageFilter {
  return addUsageFilterIds(
    filter,
    USAGE_FILTER_CATEGORY_BY_DIMENSION[dimension],
    [id]
  );
}

export function removeUsageFilterDimensionId(
  filter: UsageFilter,
  dimension: ConsumptionScopeDimension,
  id: string
): UsageFilter {
  return removeUsageFilterId(
    filter,
    USAGE_FILTER_CATEGORY_BY_DIMENSION[dimension],
    id
  );
}

// Replaces that dimension's selection while preserving the other filters.
export function setUsageFilterDimensionId(
  filter: UsageFilter,
  dimension: ConsumptionScopeDimension,
  id: string
): UsageFilter {
  return {
    ...filter,
    [USAGE_FILTER_CATEGORY_BY_DIMENSION[dimension]]: [id],
  };
}

export function toConsumptionScopeFilter(
  filter: UsageFilter
): ConsumptionScopeFilter {
  const scopeFilter: ConsumptionScopeFilter = {};

  for (const dimension of CONSUMPTION_SCOPE_DIMENSIONS) {
    const ids = filter[USAGE_FILTER_CATEGORY_BY_DIMENSION[dimension]];
    if (ids && ids.length > 0) {
      scopeFilter[CONSUMPTION_DIMENSION_FILTER_KEYS[dimension]] = ids;
    }
  }

  return scopeFilter;
}
