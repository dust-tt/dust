// LABS - CAN BE REMOVED ANYTIME

import type { KillSwitchType } from "@app/lib/poke/types";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

type GetKillSwitchesResponseBody = {
  killSwitches: KillSwitchType[];
};

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
