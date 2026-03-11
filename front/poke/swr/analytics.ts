import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWorkspaceActiveUsersResponse } from "@app/pages/api/w/[wId]/analytics/active-users";
import type { GetWorkspaceUsageMetricsResponse } from "@app/pages/api/w/[wId]/analytics/usage-metrics";
import type { Fetcher } from "swr";

export function usePokeWorkspaceUsageMetrics({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  interval = "day",
  disabled,
}: {
  workspaceId: string;
  days?: number;
  interval?: "day" | "week";
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetWorkspaceUsageMetricsResponse> = fetcher;
  const key = `/api/poke/workspaces/${workspaceId}/analytics/usage-metrics?days=${days}&interval=${interval}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    usageMetrics: data?.points ?? emptyArray(),
    isUsageMetricsLoading: !error && !data && !disabled,
    isUsageMetricsError: error,
    isUsageMetricsValidating: isValidating,
  };
}

export function usePokeWorkspaceActiveUsersMetrics({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  disabled,
}: {
  workspaceId: string;
  days?: number;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetWorkspaceActiveUsersResponse> = fetcher;
  const key = `/api/poke/workspaces/${workspaceId}/analytics/active-users?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    activeUsersMetrics: data?.points ?? emptyArray(),
    isActiveUsersMetricsLoading: !error && !data && !disabled,
    isActiveUsersMetricsError: error,
    isActiveUsersMetricsValidating: isValidating,
  };
}
