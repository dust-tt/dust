import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { ConversationConsumptionResponse } from "@app/types/assistant/conversation_consumption";
import type { Fetcher } from "swr";

export function useConversationConsumption({
  conversationId,
  workspaceId,
}: {
  conversationId: string;
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const consumptionFetcher: Fetcher<ConversationConsumptionResponse> = fetcher;

  const { data, error, isLoading, isValidating, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/consumption`,
    consumptionFetcher,
    { revalidateOnFocus: false }
  );

  return {
    consumption: data,
    isConsumptionLoading: isLoading || isValidating,
    isConsumptionError: error,
    mutateConsumption: mutate,
  };
}
