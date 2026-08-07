import type {
  UsageFilter,
  UsageFilterCategory,
  UsageFilterOptionForCategory,
} from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  removeUsageFilterOption,
  selectAllUsageFilterOptions,
  toggleUsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
import { useCallback, useState } from "react";

export function useUsageFilter(initialFilter: UsageFilter) {
  const [draftFilter, setDraftFilter] = useState<UsageFilter>(initialFilter);

  const clearAllCategories = useCallback(() => {
    setDraftFilter({});
  }, []);

  const clearCategory = useCallback((category: UsageFilterCategory) => {
    setDraftFilter((prev) => clearUsageFilterCategory(prev, category));
  }, []);

  const toggleOption = useCallback(
    <C extends UsageFilterCategory>(
      category: C,
      option: NoInfer<UsageFilterOptionForCategory<C>>
    ) => {
      setDraftFilter((prev) => toggleUsageFilterOption(prev, category, option));
    },
    []
  );

  const removeOption = useCallback(
    (category: UsageFilterCategory, id: string) => {
      setDraftFilter((prev) => removeUsageFilterOption(prev, category, id));
    },
    []
  );

  const selectAllFiltered = useCallback(
    <C extends UsageFilterCategory>(
      category: C,
      options: NoInfer<UsageFilterOptionForCategory<C>>[]
    ) => {
      setDraftFilter((prev) =>
        selectAllUsageFilterOptions(prev, category, options)
      );
    },
    []
  );

  return {
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleOption,
    removeOption,
    selectAllFiltered,
  };
}
