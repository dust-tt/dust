import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { AgentMessageConsumptionResponse } from "@app/types/assistant/agent_message_consumption";
import type { ConversationConsumptionResponse } from "@app/types/assistant/conversation_consumption";
import type { Fetcher } from "swr";

interface PokeConsumptionFetchProps {
  conversationId: string;
  disabled: boolean;
  workspaceId: string;
}

export function usePokeConversationConsumption({
  conversationId,
  disabled,
  workspaceId,
}: PokeConsumptionFetchProps) {
  const { fetcher } = useFetcher();
  const consumptionFetcher: Fetcher<ConversationConsumptionResponse> = fetcher;

  const { data, error, isLoading, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}/consumption`,
    consumptionFetcher,
    { disabled, revalidateOnFocus: false }
  );

  return {
    consumption: data,
    isConsumptionError: error,
    isConsumptionLoading: !disabled && (isLoading || isValidating),
    mutateConsumption: mutate,
  };
}

interface PokeAgentMessageConsumptionFetchProps
  extends PokeConsumptionFetchProps {
  messageId: string;
}

export function usePokeAgentMessageConsumption({
  conversationId,
  disabled,
  messageId,
  workspaceId,
}: PokeAgentMessageConsumptionFetchProps) {
  const { fetcher } = useFetcher();
  const consumptionFetcher: Fetcher<AgentMessageConsumptionResponse> = fetcher;

  const { data, error, isLoading, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}/messages/${messageId}/consumption`,
    consumptionFetcher,
    { disabled, revalidateOnFocus: false }
  );

  return {
    consumption: data,
    isConsumptionError: error,
    isConsumptionLoading: !disabled && (isLoading || isValidating),
    mutateConsumption: mutate,
  };
}
