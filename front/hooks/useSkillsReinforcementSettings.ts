import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetSkillsReinforcementSettingsResponseBody } from "@app/types/api/skills";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useSkillsReinforcementSettings({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const settingsFetcher: Fetcher<GetSkillsReinforcementSettingsResponseBody> =
    fetcher;
  const { data, isLoading, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills/reinforcement_settings`,
    settingsFetcher
  );

  return {
    skills:
      data?.skills ??
      emptyArray<
        GetSkillsReinforcementSettingsResponseBody["skills"][number]
      >(),
    isSkillsLoading: isLoading,
    isSkillsError: error,
  };
}
