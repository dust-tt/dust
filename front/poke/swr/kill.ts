import { useMemo } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { fetcher } from "@app/lib/swr/swr";
import type { GetKillSwitchesResponseBody } from "@app/pages/api/poke/kill";

const EMPTY_ARRAY: GetKillSwitchesResponseBody["killSwitches"] = [];

export function usePokeKillSwitches() {
  const killSwitchesFetcher: Fetcher<GetKillSwitchesResponseBody> = fetcher;

  const { data, error, mutate } = useSWR("/api/poke/kill", killSwitchesFetcher);

  return {
    killSwitches: data?.killSwitches ?? EMPTY_ARRAY,
    isKillSwitchesLoading: !error && !data,
    isKillSwitchesError: error,
    mutateKillSwitches: mutate,
  };
}
