import type { PokeListProjects } from "@app/lib/api/poke/projects";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeProjects({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const projectsFetcher: Fetcher<PokeListProjects> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects`,
    projectsFetcher,
    { disabled }
  );

  return {
    data: data?.projects ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
