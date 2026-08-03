import type { PokeListSpaces } from "@app/lib/api/poke/spaces";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeSpaces({ disabled, owner }: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const spacesFetcher: Fetcher<PokeListSpaces> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/spaces`,
    spacesFetcher,
    { disabled }
  );

  return {
    data: data?.spaces ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
