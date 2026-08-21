import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { AnalyticsViewState } from "@app/lib/analytics/view_params";
import {
  analyticsViewQuery,
  analyticsViewQueryString,
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
  const [view, setView] = useState<AnalyticsViewState>(() =>
    readAnalyticsView(router.query)
  );

  useEffect(() => {
    const nextQuery = analyticsViewQuery(view);
    if (
      analyticsViewQueryString(router.query) ===
      analyticsViewQueryString(nextQuery)
    ) {
      return;
    }

    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, ...nextQuery },
      },
      undefined,
      { shallow: true }
    );
  }, [router, view]);

  const setPeriod = useCallback((period: ConsumptionPeriodSelection) => {
    setView((current) => ({ ...current, period }));
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
    dimension: view.dimension,
    filter: view.filter,
    setPeriod,
    setDimension,
    setFilter,
  };
}
