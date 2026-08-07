import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
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

export const USAGE_FILTER_SCOPES = ["company", "shared", "private"] as const;

export type UsageFilterScope = (typeof USAGE_FILTER_SCOPES)[number];

export const USAGE_FILTER_SCOPE_LABEL: Record<UsageFilterScope, string> = {
  company: "Company",
  shared: "Shared",
  private: "Private",
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
  tier: UsageModelTier;
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

// Only "user" is wired to a real consumption scope dimension so far; the
// other categories stay mock data and are not sent as query filters.
export function toConsumptionScopeFilter(
  filter: UsageFilter
): ConsumptionScopeFilter {
  const userIds = filter.user?.map((entity) => entity.id);
  return userIds && userIds.length > 0 ? { user: userIds } : {};
}
