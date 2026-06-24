import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentSkillsResponseBody } from "@app/types/api/assistant/configuration/skills";
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

  const { data, error, isLoading, isValidating, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/skills`,
    skillsFetcher,
    { disabled }
  );

  return {
    skills: data?.skills ?? emptyArray(),
    isSkillsLoading: isLoading,
    isSkillsError: !!error,
    isSkillsValidating: isValidating,
    mutateSkills: mutate,
  };
}
