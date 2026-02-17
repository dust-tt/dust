import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetSkillDetails } from "@app/pages/api/poke/workspaces/[wId]/skills/[sId]/details";
import type { PokeGetSkillVersions } from "@app/pages/api/poke/workspaces/[wId]/skills/[sId]/versions";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

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

interface UsePokeSkillVersionsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  skillId: string;
}

export function usePokeSkillVersions({
  disabled,
  owner,
  skillId,
}: UsePokeSkillVersionsProps) {
  const skillVersionsFetcher: Fetcher<PokeGetSkillVersions> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/skills/${skillId}/versions`,
    skillVersionsFetcher,
    { disabled }
  );

  return {
    versions: data?.versions ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
