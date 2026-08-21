import type {
  UsageFilter,
  UsageFilterCategory,
} from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterIds,
  clearUsageFilterCategory,
  removeUsageFilterId,
  toggleUsageFilterId,
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

  const toggleId = useCallback((category: UsageFilterCategory, id: string) => {
    setDraftFilter((prev) => toggleUsageFilterId(prev, category, id));
  }, []);

  const removeId = useCallback((category: UsageFilterCategory, id: string) => {
    setDraftFilter((prev) => removeUsageFilterId(prev, category, id));
  }, []);

  const addIds = useCallback((category: UsageFilterCategory, ids: string[]) => {
    setDraftFilter((prev) => addUsageFilterIds(prev, category, ids));
  }, []);

  return {
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleId,
    removeId,
    addIds,
  };
}
