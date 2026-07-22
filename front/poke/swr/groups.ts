import type { PokeListGroups } from "@app/lib/api/poke/groups";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeGroups({
  disabled,
  owner,
  withPoolCaps,
}: PokeConditionalFetchProps & {
  // Declares that this caller reads `poolCapAwuCredits`. The cap is still
  // returned unconditionally, so callers that omit this keep working; a
  // follow-up makes it conditional once every bundle sends the flag.
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
