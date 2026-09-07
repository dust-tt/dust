import type { PokeListGroups } from "@app/lib/api/poke/groups";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeGroups({
  disabled,
  owner,
  withPoolCaps,
}: PokeConditionalFetchProps & {
  // Also resolves each group's pool cap (one extra batched query server-side).
  // Without it `poolCapAwuCredits` is absent from the response, so any caller
  // that reads the cap must set this.
  withPoolCaps?: boolean;
}) {
  const { fetcher } = useFetcher();
  const groupsFetcher: Fetcher<PokeListGroups> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/groups${withPoolCaps ? "?withPoolCaps=true" : ""}`,
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
