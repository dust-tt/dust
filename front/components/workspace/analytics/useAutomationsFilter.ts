import type {
  AutomationsFilter,
  AutomationsFilterCategory,
  AutomationsFilterOption,
} from "@app/components/workspace/analytics/automationsFilter";
import { useFilterDraft } from "@app/components/workspace/analytics/filterPanel/useFilterDraft";

export function useAutomationsFilter(initialFilter: AutomationsFilter) {
  return useFilterDraft<AutomationsFilterCategory, AutomationsFilterOption>(
    initialFilter
  );
}
