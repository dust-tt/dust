import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/types/api/analytics/consumption";
import {
  CONSUMPTION_DIMENSION_FILTER_KEYS,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/types/api/analytics/consumption";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
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

const PERSONAL_USAGE_FILTER_CATEGORIES: UsageFilterCategory[] =
  USAGE_FILTER_CATEGORIES.filter(
    (category) => category !== "member" && category !== "group"
  );

const AGENT_USAGE_FILTER_CATEGORIES = USAGE_FILTER_CATEGORIES.filter(
  (category) => category !== "agent"
);

export function getUsageFilterCategories({
  personal,
  agent,
}: {
  personal?: boolean;
  agent?: boolean;
}): readonly UsageFilterCategory[] {
  if (personal) {
    return PERSONAL_USAGE_FILTER_CATEGORIES;
  }
  return agent ? AGENT_USAGE_FILTER_CATEGORIES : USAGE_FILTER_CATEGORIES;
}

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

export type UsageFilterIds = Partial<
  Record<ConsumptionScopeDimension, string[]>
>;

// URL filters only carry ids. Keep that transport shape at the boundary and
// use minimal options until the user replaces them from the filter panel.
export function usageFilterFromIds(ids: UsageFilterIds): UsageFilter {
  let filter: UsageFilter = {};
  for (const dimension of CONSUMPTION_SCOPE_DIMENSIONS) {
    for (const id of ids[dimension] ?? []) {
      filter = addUsageFilterOption(
        filter,
        usageFilterOptionFromAttributionRow(dimension, {
          id,
          name: id,
          pictureUrl: null,
        })
      );
    }
  }

  return filter;
}

export function usageFilterToIds(filter: UsageFilter): UsageFilterIds {
  return {
    agent: filter.agent?.map(({ id }) => id),
    user: filter.member?.map(({ id }) => id),
    group: filter.group?.map(({ id }) => id),
    model: filter.model?.map(({ id }) => id),
    tool: filter.tool?.map(({ id }) => id),
    skill: filter.skill?.map(({ id }) => id),
    source: filter.source?.map(({ id }) => id),
    api_key: filter.api_key?.map(({ id }) => id),
  };
}

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

export function removeUsageFilterFromAttributionRow(
  filter: UsageFilter,
  dimension: ConsumptionScopeDimension,
  row: AttributionFilterRow
): UsageFilter {
  const option = usageFilterOptionFromAttributionRow(dimension, row);
  return removeUsageFilterOption(filter, option.kind, option.id);
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
