import { FilterSummaryChips } from "@app/components/workspace/analytics/filterPanel/FilterSummaryChips";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  getUsageFilterSummaries,
} from "@app/components/workspace/analytics/usageFilter";

interface UsageFilterSummaryProps {
  filter: UsageFilter;
  onFilterChange: (filter: UsageFilter) => void;
}

export function UsageFilterSummary({
  filter,
  onFilterChange,
}: UsageFilterSummaryProps) {
  return (
    <FilterSummaryChips
      summaries={getUsageFilterSummaries(filter)}
      onClearCategory={(category) =>
        onFilterChange(clearUsageFilterCategory(filter, category))
      }
      onClearAll={() => onFilterChange({})}
    />
  );
}
