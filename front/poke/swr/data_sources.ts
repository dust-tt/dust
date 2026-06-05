import type { PokeListDataSources } from "@app/lib/api/poke/data_sources";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeDataSources({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const dataSourceViewsFetcher: Fetcher<PokeListDataSources> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_sources`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: data?.data_sources ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
