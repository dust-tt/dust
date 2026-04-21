import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetSkillSuggestionDetails } from "@app/pages/api/poke/workspaces/[wId]/skill_suggestions/[suggestionId]/details";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeSkillSuggestionDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  suggestionId: string;
}

export function usePokeSkillSuggestionDetails({
  disabled,
  owner,
  suggestionId,
}: UsePokeSkillSuggestionDetailsProps) {
  const { fetcher } = useFetcher();
  const detailsFetcher: Fetcher<PokeGetSkillSuggestionDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/skill_suggestions/${suggestionId}/details`,
    detailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
