import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  usageFilterFromIds,
  usageFilterToIds,
} from "@app/components/workspace/analytics/usageFilter";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import type { AnalyticsViewState } from "@app/lib/analytics/view_params";
import {
  analyticsViewQueryString,
  analyticsViewUrlQuery,
  readAnalyticsView,
} from "@app/lib/analytics/view_params";
import { useAppRouter } from "@app/lib/platform";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";

/**
 * The query string is the source of truth for the period, the breakdown
 * dimension and the filter. It is read once on mount and written back with
 * `replace`, so Back leaves the page instead of stepping through every filter
 * edit.
 */
export function useAnalyticsViewState() {
  const router = useAppRouter();
  const [view, setView] = useState<
    Omit<AnalyticsViewState, "filter"> & { filter: UsageFilter }
  >(() => {
    const initialView = readAnalyticsView(router.query);
    return {
      ...initialView,
      filter: usageFilterFromIds(initialView.filter),
    };
  });

  useEffect(() => {
    const urlView: AnalyticsViewState = {
      ...view,
      filter: usageFilterToIds(view.filter),
    };
    const nextQuery = analyticsViewUrlQuery(
      router.pathname,
      router.query,
      urlView
    );
    const shouldDropQuery = Object.keys(nextQuery).length === 0;
    if (
      (shouldDropQuery && Object.keys(router.query).length === 0) ||
      (!shouldDropQuery &&
        analyticsViewQueryString(router.query) ===
          analyticsViewQueryString(nextQuery))
    ) {
      return;
    }

    void router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true }
    );
  }, [router, view]);

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
  };
}
