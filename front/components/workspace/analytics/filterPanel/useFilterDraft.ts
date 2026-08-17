import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/workspace/analytics/filterPanel/filterState";
import {
  clearFilterCategory,
  removeFilterOption,
  selectAllFilterOptions,
  toggleFilterOption,
} from "@app/components/workspace/analytics/filterPanel/filterState";
import { useCallback, useState } from "react";

// Selections are staged in a local draft while a filter panel is open and
// only propagated to the caller when the user applies them.
export function useFilterDraft<
  Category extends string,
  Option extends FilterOptionBase,
>(initialFilter: CategoryFilter<Category, Option>) {
  const [draftFilter, setDraftFilter] =
    useState<CategoryFilter<Category, Option>>(initialFilter);

  const clearAllCategories = useCallback(() => {
    setDraftFilter({});
  }, []);

  const clearCategory = useCallback((category: Category) => {
    setDraftFilter((prev) => clearFilterCategory(prev, category));
  }, []);

  const toggleOption = useCallback((category: Category, option: Option) => {
    setDraftFilter((prev) => toggleFilterOption(prev, category, option));
  }, []);

  const removeOption = useCallback((category: Category, id: string) => {
    setDraftFilter((prev) => removeFilterOption(prev, category, id));
  }, []);

  const selectAllFiltered = useCallback(
    (category: Category, options: Option[]) => {
      setDraftFilter((prev) => selectAllFilterOptions(prev, category, options));
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
