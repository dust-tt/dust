import uniqueId from "lodash/uniqueId";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import type { AssistantBuilderMCPConfigurationWithId } from "@app/components/assistant_builder/types";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetActionsResponseBody } from "@app/pages/api/w/[wId]/builder/assistants/[aId]/actions";

function useAssistantConfigurationActions(
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

  const actionsWithIds: AssistantBuilderMCPConfigurationWithId[] = useMemo(
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
