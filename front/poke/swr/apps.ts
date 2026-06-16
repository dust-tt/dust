import type { PokeListApps } from "@app/lib/api/poke/apps";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeApps({ disabled, owner }: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
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
