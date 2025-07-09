import { useMemo } from "react";
import type { Fetcher } from "swr";

import type { AgentBuilderAction } from "@app/components/agent_builder/AgentBuilderFormContext";
import { transformAssistantBuilderActionsToFormData } from "@app/components/agent_builder/transformAgentConfiguration";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetActionsResponseBody } from "@app/pages/api/w/[wId]/builder/assistants/[aId]/actions";

export function useAssistantConfigurationActions(
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

  return {
    actions: data?.actions ?? emptyArray(),
    isActionsLoading: !error && !data && !disabled,
    error,
  };
}

export function useAgentConfigurationActions(
  ownerId: string,
  agentConfigurationId: string | null,
  mcpServerViews?: Array<{ sId: string; server: { name: string } }>
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

  // Transform assistant builder actions to agent builder form actions
  const actions = useMemo((): AgentBuilderAction[] => {
    if (!data?.actions) {
      return [];
    }

    const transformResult = transformAssistantBuilderActionsToFormData(
      data.actions,
      mcpServerViews || []
    );
    return transformResult.isOk() ? transformResult.value : [];
  }, [data, mcpServerViews]);

  return {
    actions,
    isActionsLoading: !error && !data && !disabled,
    error,
  };
}
