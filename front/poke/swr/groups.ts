import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListGroups } from "@app/pages/api/poke/workspaces/[wId]/groups";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeGroups({ disabled, owner }: PokeConditionalFetchProps) {
  const groupsFetcher: Fetcher<PokeListGroups> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/groups`,
    groupsFetcher,
    { disabled }
  );

  return {
    data: data?.groups ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
