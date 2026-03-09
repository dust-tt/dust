// LABS - CAN BE REMOVED ANYTIME

import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetKillSwitchesResponseBody } from "@app/pages/api/kill";
import type { Fetcher } from "swr";

export function useKillSwitches() {
  const { fetcher } = useFetcher();
  const killSwitchesFetcher: Fetcher<GetKillSwitchesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/kill`,
    killSwitchesFetcher
  );

  return {
    killSwitches: data ? data.killSwitches : null,
    isKillSwitchesLoading: !error && !data,
    isKillSwitchesError: error,
    mutateKillSwitches: mutate,
  };
}
