import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetSkillDetails } from "@app/pages/api/poke/workspaces/[wId]/skills/[sId]/details";
import type { LightWorkspaceType } from "@app/types";

interface UsePokeSkillDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  skillId: string;
}

export function usePokeSkillDetails({
  disabled,
  owner,
  skillId,
}: UsePokeSkillDetailsProps) {
  const skillDetailsFetcher: Fetcher<PokeGetSkillDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/skills/${skillId}/details`,
    skillDetailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
