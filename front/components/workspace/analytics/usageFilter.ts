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
  // Used to group models in the "More models" dropdown by maker.
  lab: ModelMakerIdType;
  // Used for the Fast/Standard/Complex quick filter.
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
}

export type UsageFilter = Partial<
  Record<UsageFilterCategory, UsageFilterOption[]>
>;

export function toggleUsageFilterEntity(
  filter: UsageFilter,
  category: UsageFilterCategory,
  entity: UsageFilterOption
): UsageFilter {
  const current = filter[category] ?? [];
  const next = current.some((e) => e.id === entity.id)
    ? current.filter((e) => e.id !== entity.id)
    : [...current, entity];
  return { ...filter, [category]: next.length > 0 ? next : undefined };
}

export function removeUsageFilterEntity(
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

export function selectAllUsageFilterEntities(
  filter: UsageFilter,
  category: UsageFilterCategory,
  entities: UsageFilterOption[]
): UsageFilter {
  const current = filter[category] ?? [];
  const currentIds = new Set(current.map((e) => e.id));
  const additions = entities.filter((e) => !currentIds.has(e.id));
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
