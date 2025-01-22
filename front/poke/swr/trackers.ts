import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListTrackers } from "@app/pages/api/poke/workspaces/[wId]/trackers";
import type { PokeFetchTrackerResponse } from "@app/pages/api/poke/workspaces/[wId]/trackers/[tId]";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeTrackers({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const trackersFetcher: Fetcher<PokeListTrackers> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/trackers`,
    trackersFetcher,
    { disabled }
  );

  return {
    data: data?.trackers ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}

export function usePokeTracker({
  disabled,
  owner,
  tId,
}: PokeConditionalFetchProps & { tId: string }) {
  const trackerFetcher: Fetcher<PokeFetchTrackerResponse> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/trackers/${tId}`,
    trackerFetcher,
    { disabled }
  );

  return {
    data: data?.tracker,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
