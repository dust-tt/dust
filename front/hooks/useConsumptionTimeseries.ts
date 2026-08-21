import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionTimeseriesMode,
  GetConsumptionTimeseriesResponse,
} from "@app/lib/api/analytics/consumption/timeseries";

type ConsumptionTimeseriesBody = ConsumptionBody & {
  mode: ConsumptionTimeseriesMode;
  breakdownBy?: ConsumptionScopeDimension;
  breakdownCount?: number;
};

export interface UseConsumptionTimeseriesParams {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  mode: ConsumptionTimeseriesMode;
  // Omit for a single total series.
  breakdownBy?: ConsumptionScopeDimension;
  breakdownCount?: number;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}

export function useConsumptionTimeseries({
  workspaceId,
  period,
  mode,
  breakdownBy,
  breakdownCount,
  filter,
  disabled,
}: UseConsumptionTimeseriesParams) {
  const url = `/api/w/${workspaceId}/analytics/consumption/timeseries`;
  const body: ConsumptionTimeseriesBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
    mode,
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
