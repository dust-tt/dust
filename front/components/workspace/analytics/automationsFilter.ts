import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/workspace/analytics/filterPanel/filterState";
import {
  filterSelectionCount,
  getFilterSummaries,
} from "@app/components/workspace/analytics/filterPanel/filterState";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type {
  TriggerExecutionMode,
  TriggerKind,
} from "@app/types/assistant/triggers";
import { isTriggerExecutionMode } from "@app/types/assistant/triggers";

export const AUTOMATIONS_FILTER_CATEGORIES = [
  "agent",
  "member",
  "type",
  "pool",
] as const;

export type AutomationsFilterCategory =
  (typeof AUTOMATIONS_FILTER_CATEGORIES)[number];

// A member filters their own automations, so the member category is dropped.
export const USER_AUTOMATIONS_FILTER_CATEGORIES = [
  "agent",
  "type",
  "pool",
] as const satisfies readonly AutomationsFilterCategory[];

export const AUTOMATIONS_FILTER_CATEGORY_LABEL: Record<
  AutomationsFilterCategory,
  string
> = {
  agent: "Agents",
  member: "Members",
  type: "Type",
  pool: "Pool",
};

export const AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL: Record<
  AutomationsFilterCategory,
  string
> = {
  agent: "Agent",
  member: "Member",
  type: "Type",
  pool: "Pool",
};

export interface AutomationsFilterOption extends FilterOptionBase {
  category: AutomationsFilterCategory;
  image?: string | null;
}

export type AutomationsFilter = CategoryFilter<
  AutomationsFilterCategory,
  AutomationsFilterOption
>;

export function getAutomationsFilterSummaries(
  filter: AutomationsFilter,
  categories: readonly AutomationsFilterCategory[] = AUTOMATIONS_FILTER_CATEGORIES
) {
  return getFilterSummaries(
    filter,
    categories,
    AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL
  );
}

export function automationsFilterSelectionCount(
  filter: AutomationsFilter,
  categories: readonly AutomationsFilterCategory[] = AUTOMATIONS_FILTER_CATEGORIES
): number {
  return filterSelectionCount(filter, categories);
}

export type AutomationsTriggersFilter = {
  agentIds?: string[];
  editorIds?: string[];
  kinds?: TriggerKind[];
  executionModes?: TriggerExecutionMode[];
};

// Availability counts ignore the type and pool filters: trigger kinds and
// execution modes are not consumption dimensions, so they cannot be expressed
// as a scope filter.
export function toAutomationsScopeFilter(
  filter: AutomationsFilter
): ConsumptionScopeFilter {
  const scopeFilter: ConsumptionScopeFilter = {};

  const agentIds = filter.agent?.map((option) => option.id);
  if (agentIds && agentIds.length > 0) {
    scopeFilter.agents = agentIds;
  }

  const editorIds = filter.member?.map((option) => option.id);
  if (editorIds && editorIds.length > 0) {
    scopeFilter.users = editorIds;
  }

  return scopeFilter;
}

function isTriggerKind(id: string): id is TriggerKind {
  return id === "schedule" || id === "webhook";
}

export function toAutomationsTriggersFilter(
  filter: AutomationsFilter
): AutomationsTriggersFilter {
  const agentIds = filter.agent?.map((option) => option.id);
  const editorIds = filter.member?.map((option) => option.id);
  const kinds = filter.type?.map((option) => option.id).filter(isTriggerKind);
  const executionModes = filter.pool
    ?.map((option) => option.id)
    .filter(isTriggerExecutionMode);

  return {
    ...(agentIds && agentIds.length > 0 ? { agentIds } : {}),
    ...(editorIds && editorIds.length > 0 ? { editorIds } : {}),
    ...(kinds && kinds.length > 0 ? { kinds } : {}),
    ...(executionModes && executionModes.length > 0 ? { executionModes } : {}),
  };
}

export function toUserAutomationsTriggersFilter(
  filter: AutomationsFilter
): Omit<AutomationsTriggersFilter, "editorIds"> {
  const { agentIds, kinds, executionModes } =
    toAutomationsTriggersFilter(filter);
  return {
    ...(agentIds ? { agentIds } : {}),
    ...(kinds ? { kinds } : {}),
    ...(executionModes ? { executionModes } : {}),
  };
}
