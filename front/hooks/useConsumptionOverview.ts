import type { ConsumptionPeriodSelection } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { consumptionQueryString } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useConsumptionOverview({
  workspaceId,
  period,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const overviewFetcher: Fetcher<GetConsumptionOverviewResponse> = fetcher;

  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/overview?${consumptionQueryString(period)}`,
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
