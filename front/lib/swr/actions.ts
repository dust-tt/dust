import uniqueId from "lodash/uniqueId";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import type { AgentBuilderMCPConfigurationWithId } from "@app/components/agent_builder/types";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetActionsResponseBody } from "@app/pages/api/w/[wId]/builder/assistants/[aId]/actions";
import type { GetSkillActionsResponseBody } from "@app/pages/api/w/[wId]/builder/skills/[sId]/actions";

export function useAgentConfigurationActions(
  ownerId: string,
  agentConfigurationId: string | null
) {
  const disabled = agentConfigurationId === null;
  const actionsFetcher: Fetcher<GetActionsResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${ownerId}/builder/assistants/${agentConfigurationId}/actions`,
    actionsFetcher,
    {
      disabled,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const actionsWithIds: AgentBuilderMCPConfigurationWithId[] = useMemo(
    () =>
      data?.actions.map((action) => ({
        ...action,
        id: uniqueId(),
      })) ?? emptyArray(),
    [data?.actions]
  );

  return {
    actions: actionsWithIds,
    isActionsLoading: !error && !data && !disabled,
    error,
  };
}

export function useSkillConfigurationTools(
  ownerId: string,
  skillConfigurationId: string | null
) {
  const disabled = skillConfigurationId === null;
  const actionsFetcher: Fetcher<GetSkillActionsResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${ownerId}/builder/skills/${skillConfigurationId}/actions`,
    actionsFetcher,
    {
      disabled,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const actionsWithIds: AgentBuilderMCPConfigurationWithId[] = useMemo(
    () =>
      data?.actions.map((action) => ({
        ...action,
        id: uniqueId(),
      })) ?? emptyArray(),
    [data?.actions]
  );

  return {
    actions: actionsWithIds,
    isActionsLoading: !error && !data && !disabled,
    error,
  };
}
