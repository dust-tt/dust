import type { Fetcher } from "swr";

import { fetcher, getEmptyArray, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListApps } from "@app/pages/api/poke/workspaces/[wId]/apps";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeApps({ disabled, owner }: PokeConditionalFetchProps) {
  const dataSourceViewsFetcher: Fetcher<PokeListApps> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/apps`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: data?.apps ?? getEmptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
