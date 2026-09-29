import { FILTER_HASH_PARAM } from "@app/components/shared/filter_panel/filterHash";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type {
  UsageFilter,
  UsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
import {
  getUsageFilterOptions,
  usageFilterFromSelection,
  usageFilterToSelection,
} from "@app/components/workspace/analytics/usageFilter";
import { useHashParam } from "@app/hooks/useHashParams";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import type { AnalyticsViewState } from "@app/lib/analytics/view_params";
import {
  readAnalyticsView,
  serializeAnalyticsView,
} from "@app/lib/analytics/view_params";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";

/**
 * The URL hash is the source of truth for the period, the breakdown
 * dimension and the filter. It is read once on mount and written back with
 * `replace`, so Back leaves the page instead of stepping through every filter
 * edit. `restoredOptions` are the options read from the hash, named by their
 * stored labels until facets resolve them.
 */
export function useAnalyticsViewState() {
  const [hashValue, setHashValue] = useHashParam(FILTER_HASH_PARAM);
  const [restored] = useState<{
    view: Omit<AnalyticsViewState, "filter"> & { filter: UsageFilter };
    options: ReadonlySet<UsageFilterOption>;
  }>(() => {
    const initialView = readAnalyticsView(hashValue);
    const filter = usageFilterFromSelection(initialView.filter);
    return {
      view: { ...initialView, filter },
      options: new Set(getUsageFilterOptions(filter)),
    };
  });
  const [view, setView] = useState(restored.view);

  useEffect(() => {
    setHashValue(
      serializeAnalyticsView({
        ...view,
        filter: usageFilterToSelection(view.filter),
      })
    );
  }, [view, setHashValue]);

  const setPeriod = useCallback((period: ConsumptionPeriodSelection) => {
    setView((current) => ({ ...current, period }));
  }, []);

  const setGranularity = useCallback((granularity: ConsumptionGranularity) => {
    setView((current) => ({ ...current, granularity }));
  }, []);

  const setDimension = useCallback((dimension: ConsumptionDimension) => {
    setView((current) => ({ ...current, dimension }));
  }, []);

  const setFilter = useCallback((filter: SetStateAction<UsageFilter>) => {
    setView((current) => ({
      ...current,
      filter: typeof filter === "function" ? filter(current.filter) : filter,
    }));
  }, []);

  return {
    period: view.period,
    granularity: view.granularity,
    dimension: view.dimension,
    filter: view.filter,
    setPeriod,
    setGranularity,
    setDimension,
    setFilter,
    restoredOptions: restored.options,
  };
}
