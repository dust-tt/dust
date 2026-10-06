import { clearFilterCategory } from "@app/components/shared/filter_panel/filterState";
import { FilterSummaryChips } from "@app/components/shared/filter_panel/FilterSummaryChips";
import type {
  AutomationsFilter,
  AutomationsFilterCategory,
} from "@app/components/workspace/analytics/automationsFilter";
import {
  AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL,
  getAutomationsFilterSummaries,
} from "@app/components/workspace/analytics/automationsFilter";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

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
  const { t } = useLingui();
  const categoryLabels = useMemo<Record<AutomationsFilterCategory, string>>(
    () => ({
      agent: t(AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL.agent),
      member: t(AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL.member),
      type: t(AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL.type),
      pool: t(AUTOMATIONS_FILTER_CATEGORY_SINGULAR_LABEL.pool),
    }),
    [t]
  );
  return (
    <FilterSummaryChips
      summaries={getAutomationsFilterSummaries(
        filter,
        categoryLabels,
        categories
      )}
      onClearCategory={(category) =>
        onFilterChange(clearFilterCategory(filter, category))
      }
      onClearAll={() => onFilterChange({})}
    />
  );
}
