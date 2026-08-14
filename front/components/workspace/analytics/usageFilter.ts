import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { ConnectorProvider } from "@app/types/data_source";
import { isConnectorProvider } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";

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

export type UsageFilter = {
  [C in UsageFilterCategory]?: UsageFilterOptionForCategory<C>[];
};

export interface UsageFilterSummary {
  category: UsageFilterCategory;
  categoryLabel: string;
  options: Array<{ id: string; name: string }>;
}

export function getUsageFilterSummaries(
  filter: UsageFilter
): UsageFilterSummary[] {
  return USAGE_FILTER_CATEGORIES.flatMap((category) => {
    const options = filter[category];
    if (!options?.length) {
      return [];
    }

    return [
      {
        category,
        categoryLabel: USAGE_FILTER_CATEGORY_SINGULAR_LABEL[category],
        options: options.map(({ id, name }) => ({ id, name })),
      },
    ];
  });
}

export function usageFilterSelectionCount(filter: UsageFilter): number {
  return USAGE_FILTER_CATEGORIES.reduce(
    (count, category) => count + (filter[category]?.length ?? 0),
    0
  );
}

export function toggleUsageFilterOption<C extends UsageFilterCategory>(
  filter: UsageFilter,
  category: C,
  option: NoInfer<UsageFilterOptionForCategory<C>>
): UsageFilter {
  const current = filter[category] ?? [];
  const isSelected = current.some((e) => e.id === option.id);
  const next = isSelected
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

type AttributionFilterRow = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

function usageFilterOptionFromAttributionRow(
  dimension: ConsumptionScopeDimension,
  row: AttributionFilterRow
): UsageFilterOption {
  const baseOption = {
    id: row.id,
    name: row.name,
    disabled: false,
  };

  switch (dimension) {
    case "agent":
      return { ...baseOption, kind: "agent", image: row.pictureUrl };
    case "user":
      return { ...baseOption, kind: "member", image: row.pictureUrl };
    case "group":
      return { ...baseOption, kind: "group" };
    case "model":
      return { ...baseOption, kind: "model", tier: undefined };
    case "tool":
      return { ...baseOption, kind: "tool", icon: null };
    case "skill":
      return { ...baseOption, kind: "skill", icon: null };
    case "source":
      return {
        ...baseOption,
        kind: "source",
        connectorProvider: isConnectorProvider(row.id) ? row.id : undefined,
      };
    case "api_key":
      return { ...baseOption, kind: "api_key" };
    default:
      return assertNever(dimension);
  }
}

function addUsageFilterOption(
  filter: UsageFilter,
  option: UsageFilterOption
): UsageFilter {
  switch (option.kind) {
    case "agent":
      return selectAllUsageFilterOptions(filter, "agent", [option]);
    case "member":
      return selectAllUsageFilterOptions(filter, "member", [option]);
    case "group":
      return selectAllUsageFilterOptions(filter, "group", [option]);
    case "model":
      return selectAllUsageFilterOptions(filter, "model", [option]);
    case "tool":
      return selectAllUsageFilterOptions(filter, "tool", [option]);
    case "skill":
      return selectAllUsageFilterOptions(filter, "skill", [option]);
    case "source":
      return selectAllUsageFilterOptions(filter, "source", [option]);
    case "api_key":
      return selectAllUsageFilterOptions(filter, "api_key", [option]);
    default:
      return assertNever(option);
  }
}

export function addUsageFilterFromAttributionRow(
  filter: UsageFilter,
  dimension: ConsumptionScopeDimension,
  row: AttributionFilterRow
): UsageFilter {
  return addUsageFilterOption(
    filter,
    usageFilterOptionFromAttributionRow(dimension, row)
  );
}

// Maps an attribution row to the filter UI option shape, replacing that
// dimension while preserving the other filters.
export function setUsageFilterFromAttributionRow(
  filter: UsageFilter,
  dimension: ConsumptionScopeDimension,
  row: AttributionFilterRow
): UsageFilter {
  return {
    ...filter,
    ...addUsageFilterFromAttributionRow({}, dimension, row),
  };
}

// "member" maps to the "user" dimension; every other category maps directly
// to its same-named consumption dimension.
export function toConsumptionScopeFilter(
  filter: UsageFilter
): ConsumptionScopeFilter {
  const scopeFilter: ConsumptionScopeFilter = {};

  const memberIds = filter.member?.map((entity) => entity.id);
  if (memberIds && memberIds.length > 0) {
    scopeFilter.users = memberIds;
  }

  for (const category of USAGE_FILTER_CATEGORIES) {
    if (category === "member") {
      continue;
    }
    const ids = filter[category]?.map((entity) => entity.id);
    if (ids && ids.length > 0) {
      scopeFilter[CONSUMPTION_DIMENSION_FILTER_KEYS[category]] = ids;
    }
  }

  return scopeFilter;
}
