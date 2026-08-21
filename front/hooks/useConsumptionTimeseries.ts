import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionAccessScope,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionBreakdownDimension,
  ConsumptionTimeseriesMode,
  GetConsumptionTimeseriesResponse,
} from "@app/lib/api/analytics/consumption/timeseries";

type ConsumptionTimeseriesRequestBody = ConsumptionBody & {
  mode: ConsumptionTimeseriesMode;
  breakdownBy?: ConsumptionBreakdownDimension;
  breakdownCount?: number;
};

export interface UseConsumptionTimeseriesParams {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  mode: ConsumptionTimeseriesMode;
  // Omit for a single total series.
  breakdownBy?: ConsumptionBreakdownDimension;
  breakdownCount?: number;
  filter?: ConsumptionScopeFilter;
  accessScope?: ConsumptionAccessScope;
  disabled?: boolean;
}

export function useConsumptionTimeseries({
  workspaceId,
  period,
  mode,
  breakdownBy,
  breakdownCount,
  filter,
  accessScope,
  disabled,
}: UseConsumptionTimeseriesParams) {
  const url = getConsumptionAnalyticsUrl({
    workspaceId,
    accessScope,
    endpoint: "timeseries",
  });
  const body: ConsumptionTimeseriesRequestBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
    mode,
    breakdownBy,
    breakdownCount,
  };

  const { data, error, isValidating } = useConsumptionQuery<
    ConsumptionTimeseriesRequestBody,
    GetConsumptionTimeseriesResponse
  >({ url, body, disabled });

  return {
    timeseries: data ?? null,
    isTimeseriesLoading: !error && !data && !disabled,
    isTimeseriesError: error,
    isTimeseriesValidating: isValidating,
  };
}
