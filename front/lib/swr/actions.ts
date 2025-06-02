import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetActionsResponseBody } from "@app/pages/api/w/[wId]/builder/assistants/[aId]/actions";

export function useAssistantConfigurationActions(
  ownerId: string,
  agentConfigurationId: string | null
) {
  const actionsFetcher: Fetcher<GetActionsResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${ownerId}/builder/assistants/${agentConfigurationId}/actions`,
    actionsFetcher,
    {
      disabled: agentConfigurationId === null,
    }
  );

  return {
    actions: data?.actions ?? emptyArray(),
    isActionsLoading: !error && !data,
    error,
  };
}
