import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { FetchConversationToolsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/tools";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UseAgentMessageToolsParams {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType | null;
  agentConfigurationId: string | null;
  options?: {
    disabled: boolean;
  };
}

export function useAgentMessageTools({
  owner,
  conversation,
  agentConfigurationId,
  options,
}: UseAgentMessageToolsParams) {
  const { fetcher } = useFetcher();
  const toolsFetcher: Fetcher<FetchConversationToolsResponse> = fetcher;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    conversation && agentConfigurationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/tools?agent_configuration_id=${agentConfigurationId}`
      : null,
    toolsFetcher,
    options
  );

  return {
    tools: data?.tools ?? emptyArray(),
    isToolsLoading: !options?.disabled && isLoading,
    isToolsError: !!error,
    mutateTools: mutate,
  };
}
