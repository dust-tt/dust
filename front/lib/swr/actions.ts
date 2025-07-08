import { useMemo } from "react";
import type { Fetcher } from "swr";

import type { AgentBuilderAction } from "@app/components/agent_builder/AgentBuilderFormContext";
import { transformActionsToFormData } from "@app/components/agent_builder/transformAgentConfiguration";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetActionsResponseBody } from "@app/pages/api/w/[wId]/builder/assistants/[aId]/actions";
import type { AgentConfigurationType } from "@app/types";

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
  agentConfigurationId: string | null
) {
  const disabled = agentConfigurationId === null;
  const configurationFetcher: Fetcher<{
    agentConfiguration: AgentConfigurationType;
  }> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${ownerId}/assistant/agent_configurations/${agentConfigurationId}`,
    configurationFetcher,
    {
      disabled,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  // Transform raw agent configuration to client-side form data
  const actions = useMemo((): AgentBuilderAction[] => {
    if (!data || !data.agentConfiguration || !data.agentConfiguration.actions) {
      return [];
    }

    const transformResult = transformActionsToFormData(
      data.agentConfiguration.actions,
      data.agentConfiguration.visualizationEnabled
    );

    return transformResult.isOk() ? transformResult.value : [];
  }, [data]);

  return {
    actions,
    isActionsLoading: !error && !data && !disabled,
    error,
  };
}
