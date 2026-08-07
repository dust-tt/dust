import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { ConnectorProvider } from "@app/types/data_source";

export const USAGE_FILTER_CATEGORIES = [
  "agent",
  "member",
  "team",
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
    team: "Teams",
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
  image: string | null;
}

export interface UsageFilterMemberOption extends UsageFilterOptionBase {
  kind: "member";
  image: string | null;
}

export interface UsageFilterTeamOption extends UsageFilterOptionBase {
  kind: "team";
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
  | UsageFilterTeamOption
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

// Members, teams, and agents are wired to real consumption scope dimensions.
// The other categories stay mock data and are not sent as query filters yet.
export function toConsumptionScopeFilter(
  filter: UsageFilter
): ConsumptionScopeFilter {
  const scopeFilter: ConsumptionScopeFilter = {};

  const memberIds = filter.member?.map((entity) => entity.id);
  if (memberIds && memberIds.length > 0) {
    scopeFilter.users = memberIds;
  }

  const teamIds = filter.team?.map((entity) => entity.id);
  if (teamIds && teamIds.length > 0) {
    scopeFilter.teams = teamIds;
  }

  const agentIds = filter.agent?.map((entity) => entity.id);
  if (agentIds && agentIds.length > 0) {
    scopeFilter.agents = agentIds;
  }

  return scopeFilter;
}
