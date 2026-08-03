import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { AgentMessageConsumptionResponse } from "@app/types/assistant/agent_message_consumption";
import type { Fetcher } from "swr";

export function useAgentMessageConsumption({
  conversationId,
  workspaceId,
  messageId,
  disabled,
}: {
  conversationId: string;
  workspaceId: string;
  messageId: string;
  disabled: boolean;
}) {
  const { fetcher } = useFetcher();
  const consumptionFetcher: Fetcher<AgentMessageConsumptionResponse> = fetcher;

  const { data, isLoading, isValidating, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/consumption`,
    consumptionFetcher,
    { disabled, revalidateOnFocus: false }
  );

  return {
    consumption: data,
    isConsumptionLoading: !disabled && (isLoading || isValidating),
    mutateConsumption: mutate,
  };
}
