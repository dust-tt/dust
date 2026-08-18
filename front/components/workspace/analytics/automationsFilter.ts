import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/workspace/analytics/filterPanel/filterState";
import {
  filterSelectionCount,
  getFilterSummaries,
} from "@app/components/workspace/analytics/filterPanel/filterState";
import type { TriggerKind } from "@app/types/assistant/triggers";

export const AUTOMATIONS_FILTER_CATEGORIES = [
  "agent",
  "member",
  "type",
] as const;

export type AutomationsFilterCategory =
  (typeof AUTOMATIONS_FILTER_CATEGORIES)[number];

export const AUTOMATIONS_FILTER_CATEGORY_LABEL: Record<
  AutomationsFilterCategory,
  string
> = {
  agent: "Agents",
  member: "Members",
  type: "Type",
};

export const AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL: Record<
  AutomationsFilterCategory,
  string
> = {
  agent: "Agent",
  member: "Member",
  type: "Type",
};

export interface AutomationsFilterOption extends FilterOptionBase {
  category: AutomationsFilterCategory;
  image?: string | null;
}

export type AutomationsFilter = CategoryFilter<
  AutomationsFilterCategory,
  AutomationsFilterOption
>;

export function getAutomationsFilterSummaries(filter: AutomationsFilter) {
  return getFilterSummaries(
    filter,
    AUTOMATIONS_FILTER_CATEGORIES,
    AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL
  );
}

export function automationsFilterSelectionCount(
  filter: AutomationsFilter
): number {
  return filterSelectionCount(filter, AUTOMATIONS_FILTER_CATEGORIES);
}

export type AutomationsTriggersFilter = {
  agentIds?: string[];
  editorIds?: string[];
  kinds?: TriggerKind[];
};

function isTriggerKind(id: string): id is TriggerKind {
  return id === "schedule" || id === "webhook";
}

export function toAutomationsTriggersFilter(
  filter: AutomationsFilter
): AutomationsTriggersFilter {
  const agentIds = filter.agent?.map((option) => option.id);
  const editorIds = filter.member?.map((option) => option.id);
  const kinds = filter.type?.map((option) => option.id).filter(isTriggerKind);

  return {
    ...(agentIds && agentIds.length > 0 ? { agentIds } : {}),
    ...(editorIds && editorIds.length > 0 ? { editorIds } : {}),
    ...(kinds && kinds.length > 0 ? { kinds } : {}),
  };
}
