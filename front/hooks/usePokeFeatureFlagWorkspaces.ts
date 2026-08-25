import type { GetPokeFeatureFlagWorkspacesResponseBody } from "@app/lib/api/poke/feature_flags";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeFeatureFlagWorkspaces({
  flagName,
}: {
  flagName: string;
}) {
  const { fetcher } = useFetcher();
  const workspacesFetcher: Fetcher<GetPokeFeatureFlagWorkspacesResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWR(
    `/api/poke/feature-flags/${encodeURIComponent(flagName)}`,
    workspacesFetcher
  );

  return {
    workspaces: data?.workspaces ?? emptyArray(),
    totalCount: data?.totalCount ?? 0,
    globalRolloutPercentage: data?.globalRolloutPercentage ?? null,
    mutate,
    isLoading: !error && !data,
    isError: error,
  };
}
