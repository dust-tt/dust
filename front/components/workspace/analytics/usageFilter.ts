import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { ConnectorProvider } from "@app/types/data_source";

export const USAGE_FILTER_CATEGORIES = [
  "agent",
  "member",
  "model",
  "tool",
  "skill",
  "source",
] as const;

export type UsageFilterCategory = (typeof USAGE_FILTER_CATEGORIES)[number];

export const USAGE_FILTER_CATEGORY_LABEL: Record<UsageFilterCategory, string> =
  {
    agent: "Agents",
    member: "Members",
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

export interface UsageFilterMemberOption extends UsageFilterOptionBase {
  kind: "member";
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
  | UsageFilterMemberOption
  | UsageFilterSourceOption
  | UsageFilterModelOption
  | UsageFilterToolOption
  | UsageFilterSkillOption;

export interface UsageFilterGroup {
  id: string;
  name: string;
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

// Only "member" is wired to a real consumption scope dimension ("users") so
// far; the other categories stay mock data and are not sent as query filters.
export function toConsumptionScopeFilter(
  filter: UsageFilter
): ConsumptionScopeFilter {
  const memberIds = filter.member?.map((entity) => entity.id);
  return memberIds && memberIds.length > 0 ? { users: memberIds } : {};
}
