import type {
  AutomationsFilter,
  AutomationsFilterCategory,
} from "@app/components/workspace/analytics/automationsFilter";
import { getAutomationsFilterSummaries } from "@app/components/workspace/analytics/automationsFilter";
import { FilterSummaryChips } from "@app/components/workspace/analytics/filterPanel/FilterSummaryChips";
import { clearFilterCategory } from "@app/components/workspace/analytics/filterPanel/filterState";

interface AutomationsFilterSummaryProps {
  filter: AutomationsFilter;
  onFilterChange: (filter: AutomationsFilter) => void;
  categories?: readonly AutomationsFilterCategory[];
}

export function AutomationsFilterSummary({
  filter,
  onFilterChange,
  categories,
}: AutomationsFilterSummaryProps) {
  return (
    <FilterSummaryChips
      summaries={getAutomationsFilterSummaries(filter, categories)}
      onClearCategory={(category) =>
        onFilterChange(clearFilterCategory(filter, category))
      }
      onClearAll={() => onFilterChange({})}
    />
  );
}
