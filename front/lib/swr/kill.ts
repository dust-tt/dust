// LABS - CAN BE REMOVED ANYTIME

import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetKillSwitchesResponseBody } from "@app/pages/api/kill";

export function useKillSwitches() {
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
