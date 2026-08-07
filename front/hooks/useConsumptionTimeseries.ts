import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { consumptionQueryString } from "@app/lib/analytics/consumption_period";
import type {
  ConsumptionBreakdownDimension,
  ConsumptionTimeseriesMode,
  GetConsumptionTimeseriesResponse,
} from "@app/lib/api/analytics/consumption/timeseries";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useConsumptionTimeseries({
  workspaceId,
  period,
  mode,
  breakdownBy,
  breakdownCount,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  mode: ConsumptionTimeseriesMode;
  // Omit for a single total series.
  breakdownBy?: ConsumptionBreakdownDimension;
  breakdownCount?: number;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const timeseriesFetcher: Fetcher<GetConsumptionTimeseriesResponse> = fetcher;

  const params = new URLSearchParams(consumptionQueryString(period));
  params.set("mode", mode);
  if (breakdownBy) {
    params.set("breakdownBy", breakdownBy);
  }
  if (breakdownCount !== undefined) {
    params.set("breakdownCount", String(breakdownCount));
  }

  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/timeseries?${params.toString()}`,
    timeseriesFetcher,
    { disabled }
  );

  return {
    timeseries: data ?? null,
    isTimeseriesLoading: !error && !data && !disabled,
    isTimeseriesError: error,
    isTimeseriesValidating: isValidating,
  };
}
