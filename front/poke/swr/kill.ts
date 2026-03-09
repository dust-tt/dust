import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { GetKillSwitchesResponseBody } from "@app/pages/api/poke/kill";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeKillSwitches() {
  const { fetcher } = useFetcher();
  const killSwitchesFetcher: Fetcher<GetKillSwitchesResponseBody> = fetcher;

  const { data, error, mutate } = useSWR("/api/poke/kill", killSwitchesFetcher);

  return {
    killSwitches: data?.killSwitches ?? emptyArray(),
    isKillSwitchesLoading: !error && !data,
    isKillSwitchesError: error,
    mutateKillSwitches: mutate,
  };
}
