import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
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
    data: data?.apps ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
