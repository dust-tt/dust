import { useFilterDraft } from "@app/components/shared/filter_panel/useFilterDraft";
import type {
  AutomationsFilter,
  AutomationsFilterCategory,
  AutomationsFilterOption,
} from "@app/components/workspace/analytics/automationsFilter";

export function useAutomationsFilter(initialFilter: AutomationsFilter) {
  return useFilterDraft<AutomationsFilterCategory, AutomationsFilterOption>(
    initialFilter
  );
}
