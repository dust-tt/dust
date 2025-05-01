import type { Fetcher } from "swr";

import { fetcher, getEmptyArray, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListDataSources } from "@app/pages/api/poke/workspaces/[wId]/data_sources";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeDataSources({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const dataSourceViewsFetcher: Fetcher<PokeListDataSources> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_sources`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: data?.data_sources ?? getEmptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
