import { FilterSummaryChips } from "@app/components/workspace/analytics/filterPanel/FilterSummaryChips";
import type {
  UsageFilter,
  UsageFilterOptionIndex,
} from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  getUsageFilterSummaries,
} from "@app/components/workspace/analytics/usageFilter";

interface UsageFilterSummaryProps {
  filter: UsageFilter;
  optionIndex: UsageFilterOptionIndex;
  onFilterChange: (filter: UsageFilter) => void;
}

export function UsageFilterSummary({
  filter,
  optionIndex,
  onFilterChange,
}: UsageFilterSummaryProps) {
  return (
    <FilterSummaryChips
      summaries={getUsageFilterSummaries(filter, optionIndex)}
      onClearCategory={(category) =>
        onFilterChange(clearUsageFilterCategory(filter, category))
      }
      onClearAll={() => onFilterChange({})}
    />
  );
}
