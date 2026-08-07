import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { ConnectorProvider } from "@app/types/data_source";

// "user" (not "member") to match the consumption scope dimension this
// category filters on; "Members" is only the display label below.
export const USAGE_FILTER_CATEGORIES = [
  "agent",
  "user",
  "model",
  "tool",
  "skill",
  "source",
] as const;

export type UsageFilterCategory = (typeof USAGE_FILTER_CATEGORIES)[number];

export const USAGE_FILTER_CATEGORY_LABEL: Record<UsageFilterCategory, string> =
  {
    agent: "Agents",
    user: "Members",
    model: "Models",
    tool: "Tools",
    skill: "Skills",
    source: "Sources",
  };

export const USAGE_FILTER_SCOPES = AGENT_CONFIGURATION_SCOPES;

export type UsageFilterScope = AgentConfigurationScope;

export const USAGE_FILTER_SCOPE_LABEL: Record<UsageFilterScope, string> = {
  global: "Company",
  visible: "Shared",
  hidden: "Private",
};

export const USAGE_MODEL_TIERS = ["fast", "standard", "complex"] as const;

export type UsageModelTier = (typeof USAGE_MODEL_TIERS)[number];

export const USAGE_MODEL_TIER_LABEL: Record<UsageModelTier, string> = {
  fast: "Fast",
  standard: "Standard",
  complex: "Complex",
};

interface UsageFilterOptionBase {
  id: string;
  name: string;
}

export interface UsageFilterAgentOption extends UsageFilterOptionBase {
  kind: "agent";
  scope: UsageFilterScope;
  image: string | null;
}

export interface UsageFilterUserOption extends UsageFilterOptionBase {
  kind: "user";
  image: string | null;
}

export interface UsageFilterSourceOption extends UsageFilterOptionBase {
  kind: "source";
  connectorProvider: ConnectorProvider | undefined;
}

export interface UsageFilterModelOption extends UsageFilterOptionBase {
  kind: "model";
  lab: ModelMakerIdType;
  // Undefined for a model outside the static tier table — it doesn't match
  // any Fast/Standard/Complex quick filter, so it's absent from the main
  // checklist but still reachable through the "More models" browse dropdown.
  tier: UsageModelTier | undefined;
}

export interface UsageFilterToolOption extends UsageFilterOptionBase {
  kind: "tool";
}

export interface UsageFilterSkillOption extends UsageFilterOptionBase {
  kind: "skill";
}

export type UsageFilterOption =
  | UsageFilterAgentOption
  | UsageFilterUserOption
  | UsageFilterSourceOption
  | UsageFilterModelOption
  | UsageFilterToolOption
  | UsageFilterSkillOption;

export interface UsageFilterGroup {
  id: string;
  name: string;
  // Member sIds, used to narrow the "user" category's checklist down to a
  // selected group. Not itself part of `UsageFilter` — groups only narrow the
  // picker, the user still checks individual members to filter by.
  memberIds: string[];
}

export type UsageFilterOptionForCategory<C extends UsageFilterCategory> =
  Extract<UsageFilterOption, { kind: C }>;

export type UsageFilter = {
  [C in UsageFilterCategory]?: UsageFilterOptionForCategory<C>[];
};

export function toggleUsageFilterOption<C extends UsageFilterCategory>(
  filter: UsageFilter,
  category: C,
  option: NoInfer<UsageFilterOptionForCategory<C>>
): UsageFilter {
  const current = filter[category] ?? [];
  const next = current.some((e) => e.id === option.id)
    ? current.filter((e) => e.id !== option.id)
    : [...current, option];
  return { ...filter, [category]: next.length > 0 ? next : undefined };
}

export function removeUsageFilterOption(
  filter: UsageFilter,
  category: UsageFilterCategory,
  id: string
): UsageFilter {
  const next = (filter[category] ?? []).filter((e) => e.id !== id);
  return { ...filter, [category]: next.length > 0 ? next : undefined };
}

export function clearUsageFilterCategory(
  filter: UsageFilter,
  category: UsageFilterCategory
): UsageFilter {
  return { ...filter, [category]: undefined };
}

export function selectAllUsageFilterOptions<C extends UsageFilterCategory>(
  filter: UsageFilter,
  category: C,
  options: NoInfer<UsageFilterOptionForCategory<C>>[]
): UsageFilter {
  const current = filter[category] ?? [];
  const currentIds = new Set(current.map((e) => e.id));
  const additions = options.filter((e) => !currentIds.has(e.id));
  if (additions.length === 0) {
    return filter;
  }
  return { ...filter, [category]: [...current, ...additions] };
}

export function addUsageFilterGroup(
  groups: UsageFilterGroup[],
  group: UsageFilterGroup
): UsageFilterGroup[] {
  if (groups.some((g) => g.id === group.id)) {
    return groups;
  }
  return [...groups, group];
}

export function removeUsageFilterGroup(
  groups: UsageFilterGroup[],
  id: string
): UsageFilterGroup[] {
  return groups.filter((g) => g.id !== id);
}

// Every category is wired to a real consumption scope dimension, and every
// category name matches its dimension name, so the filter maps straight
// across with no per-category translation.
export function toConsumptionScopeFilter(
  filter: UsageFilter
): ConsumptionScopeFilter {
  const scopeFilter: ConsumptionScopeFilter = {};

  for (const category of USAGE_FILTER_CATEGORIES) {
    const ids = filter[category]?.map((entity) => entity.id);
    if (ids && ids.length > 0) {
      scopeFilter[category] = ids;
    }
  }

  return scopeFilter;
}

// Maps the backend's reasoning-effort-aware pricing tier onto the filter
// panel's simpler Fast/Standard/Complex bucket. Null propagates (a model
// outside the static tier table, or a raw catalog entry with no config match)
// as "no bucket", so it's excluded from every quick-filter tier rather than
// landing in one arbitrarily.
export function usageModelTierFromModelsTierName(
  tier: ModelsTierName | null | undefined
): UsageModelTier | undefined {
  switch (tier) {
    case "cost_efficient":
      return "fast";
    case "balanced":
      return "standard";
    case "premium":
      return "complex";
    default:
      return undefined;
  }
}
