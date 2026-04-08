import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListSkillSuggestions } from "@app/pages/api/poke/workspaces/[wId]/skills/[sId]/suggestions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export interface PokeSkillSuggestionsFetchProps
  extends PokeConditionalFetchProps {
  skillId: string;
}

export function usePokeSkillSuggestions({
  disabled,
  owner,
  skillId,
}: PokeSkillSuggestionsFetchProps) {
  const { fetcher } = useFetcher();
  const suggestionsFetcher: Fetcher<PokeListSkillSuggestions> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/skills/${skillId}/suggestions`,
    suggestionsFetcher,
    { disabled }
  );

  return {
    data: data?.suggestions ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: !!error,
    mutate,
  };
}
