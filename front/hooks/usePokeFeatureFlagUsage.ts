import type { GetPokeFeatureFlagsResponseBody } from "@app/lib/api/poke/feature_flags";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeFeatureFlagUsage() {
  const { fetcher } = useFetcher();
  const featureFlagsFetcher: Fetcher<GetPokeFeatureFlagsResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    "/api/poke/feature-flags",
    featureFlagsFetcher
  );

  return {
    featureFlags: data?.featureFlags ?? emptyArray(),
    mutate,
    isLoading: !error && !data,
    isError: error,
  };
}
