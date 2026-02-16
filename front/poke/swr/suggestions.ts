import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListSuggestions } from "@app/pages/api/poke/workspaces/[wId]/assistants/[aId]/suggestions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export interface PokeSuggestionsFetchProps extends PokeConditionalFetchProps {
  agentId: string;
}

export function usePokeSuggestions({
  disabled,
  owner,
  agentId,
}: PokeSuggestionsFetchProps) {
  const suggestionsFetcher: Fetcher<PokeListSuggestions> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/assistants/${agentId}/suggestions`,
    suggestionsFetcher,
    { disabled }
  );

  return {
    data: data?.suggestions ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
