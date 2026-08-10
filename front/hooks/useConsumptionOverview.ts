import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { consumptionQueryString } from "@app/lib/analytics/consumption_period";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useConsumptionOverview({
  workspaceId,
  period,
  filter,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const overviewFetcher: Fetcher<GetConsumptionOverviewResponse> = fetcher;

  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/overview?${consumptionQueryString(period, filter)}`,
    overviewFetcher,
    { disabled }
  );

  return {
    overview: data ?? null,
    isOverviewLoading: !error && !data && !disabled,
    isOverviewError: error,
    isOverviewValidating: isValidating,
  };
}
