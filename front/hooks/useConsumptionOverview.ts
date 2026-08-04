import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useConsumptionOverview({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const overviewFetcher: Fetcher<GetConsumptionOverviewResponse> = fetcher;

  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/overview`,
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
