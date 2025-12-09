import type { Fetcher } from "swr";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { SkillConfigurationType } from "@app/types/skill_configuration";

export type GetAgentConfigurationSkillsResponseBody = {
  skills: SkillConfigurationType[];
};

export function useAgentConfigurationSkills(
  workspaceId: string,
  agentConfigurationId: string | null
) {
  const disabled = agentConfigurationId === null;
  const skillsFetcher: Fetcher<GetAgentConfigurationSkillsResponseBody> =
    fetcher;

  const { data, error, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/skills`,
    skillsFetcher,
    {
      disabled,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const skills: AgentBuilderSkillsType[] =
    data?.skills.map((skill) => ({
      id: skill.sId,
      name: skill.name,
      description: skill.description,
    })) ?? emptyArray();

  return {
    skills,
    isSkillsLoading: isLoading && !disabled,
    error,
  };
}
