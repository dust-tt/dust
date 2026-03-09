import type { AgentBuilderMCPConfigurationWithId } from "@app/components/agent_builder/types";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetActionsResponseBody } from "@app/pages/api/w/[wId]/builder/assistants/[aId]/actions";
import uniqueId from "lodash/uniqueId";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useAgentConfigurationActions(
  ownerId: string,
  agentConfigurationId: string | null
) {
  const { fetcher } = useFetcher();
  const disabled = agentConfigurationId === null;
  const actionsFetcher: Fetcher<GetActionsResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
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
    mutateActions: mutate,
    error,
  };
}
