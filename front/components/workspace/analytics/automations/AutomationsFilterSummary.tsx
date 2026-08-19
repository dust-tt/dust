import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import { getAutomationsFilterSummaries } from "@app/components/workspace/analytics/automationsFilter";
import { FilterSummaryChips } from "@app/components/workspace/analytics/filterPanel/FilterSummaryChips";
import { clearFilterCategory } from "@app/components/workspace/analytics/filterPanel/filterState";

interface AutomationsFilterSummaryProps {
  filter: AutomationsFilter;
  onFilterChange: (filter: AutomationsFilter) => void;
}

export function AutomationsFilterSummary({
  filter,
  onFilterChange,
}: AutomationsFilterSummaryProps) {
  return (
    <FilterSummaryChips
      summaries={getAutomationsFilterSummaries(filter)}
      onClearCategory={(category) =>
        onFilterChange(clearFilterCategory(filter, category))
      }
      onClearAll={() => onFilterChange({})}
    />
  );
}
