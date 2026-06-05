import type { GetAgentSkillsResponseBody } from "@app/lib/api/assistant/configuration/skills";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useAgentConfigurationSkills({
  owner,
  agentConfigurationId,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const skillsFetcher: Fetcher<GetAgentSkillsResponseBody> = fetcher;

  const { data, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/skills`,
    skillsFetcher,
    { disabled }
  );

  return {
    skills: data?.skills ?? emptyArray(),
    isSkillsLoading: isLoading,
    mutateSkills: mutate,
  };
}
