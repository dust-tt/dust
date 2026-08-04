import { AGENT_MESSAGE_COMPLETED_EVENT } from "@app/lib/notifications/events";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { ConversationConsumptionResponse } from "@app/types/assistant/conversation_consumption";
import { useEffect, useRef } from "react";
import type { Fetcher } from "swr";

// The completion event can arrive before credit accounting is persisted.
// Refresh once after a short delay so the latest breakdown is available.
const MUTATE_DELAY_MS = 3000;

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
  const mutateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleAgentMessageCompleted = () => {
      if (mutateTimeoutRef.current) {
        clearTimeout(mutateTimeoutRef.current);
      }
      mutateTimeoutRef.current = setTimeout(() => {
        mutateTimeoutRef.current = null;
        void mutate();
      }, MUTATE_DELAY_MS);
    };

    window.addEventListener(
      AGENT_MESSAGE_COMPLETED_EVENT,
      handleAgentMessageCompleted
    );

    return () => {
      window.removeEventListener(
        AGENT_MESSAGE_COMPLETED_EVENT,
        handleAgentMessageCompleted
      );
      if (mutateTimeoutRef.current) {
        clearTimeout(mutateTimeoutRef.current);
      }
    };
  }, [mutate]);

  return {
    consumption: data,
    isConsumptionLoading: isLoading || isValidating,
    isConsumptionError: error,
    mutateConsumption: mutate,
  };
}
