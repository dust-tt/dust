import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetTriggersResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/triggers";

export function useAgentTriggers({
  workspaceId,
  agentConfigurationId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const triggersFetcher: Fetcher<GetTriggersResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers`
      : null,
    triggersFetcher,
    { disabled }
  );

  return {
    triggers: data?.triggers ?? emptyArray(),
    isTriggersLoading: !!agentConfigurationId && !error && !data && !disabled,
    isTriggersError: error,
    isTriggersValidating: isValidating,
    mutateTriggers: mutate,
  };
}
