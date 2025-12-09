import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentSkillsResponseBody } from "@app/pages/api/w/[wId]/assistant/skill_configurations";
import type { LightWorkspaceType } from "@app/types";

export function useAgentConfigurationSkills({
  owner,
  agentConfigurationSId,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfigurationSId: string;
  disabled?: boolean;
}) {
  const skillsFetcher: Fetcher<GetAgentSkillsResponseBody> = fetcher;

  const { data, isLoading } = useSWRWithDefaults(
    `/api/w/${owner.sId}/assistant/skill_configurations?aId=${agentConfigurationSId}`,
    skillsFetcher,
    { disabled }
  );

  return {
    skills: data?.skills ?? emptyArray(),
    isSkillsLoading: isLoading,
  };
}
