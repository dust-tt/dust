import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionBreakdownDimension,
  ConsumptionTimeseriesMode,
  GetConsumptionTimeseriesResponse,
} from "@app/lib/api/analytics/consumption/timeseries";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";

type ConsumptionTimeseriesBody = ConsumptionBody & {
  mode: ConsumptionTimeseriesMode;
  granularity?: ConsumptionGranularity;
  breakdownBy?: ConsumptionBreakdownDimension;
  breakdownCount?: number;
};

export interface UseConsumptionTimeseriesParams {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  granularity?: ConsumptionGranularity;
  mode: ConsumptionTimeseriesMode;
  breakdownBy?: ConsumptionBreakdownDimension;
  breakdownCount?: number;
  filter?: ConsumptionScopeFilter;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
}

export function useConsumptionTimeseries({
  workspaceId,
  period,
  granularity,
  mode,
  breakdownBy,
  breakdownCount,
  filter,
  analyticsScope,
  disabled,
}: UseConsumptionTimeseriesParams) {
  const url = getConsumptionAnalyticsUrl({
    workspaceId,
    analyticsScope,
    endpoint: "timeseries",
  });
  const body: ConsumptionTimeseriesBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
    mode,
    granularity,
    breakdownBy,
    breakdownCount,
  };

  const { data, error, isValidating } = useConsumptionQuery<
    ConsumptionTimeseriesBody,
    GetConsumptionTimeseriesResponse
  >({ url, body, disabled });

  return {
    timeseries: data ?? null,
    isTimeseriesLoading: !error && !data && !disabled,
    isTimeseriesError: error,
    isTimeseriesValidating: isValidating,
  };
}
