import useSWR from "swr";
import { useDustAPI } from "./useDustAPI";
import { useCallback } from "react";
import { useAppStateRevalidation, swrConfig } from "../lib/swr";
import type { ConversationPublicType } from "@dust-tt/client";

export function useConversation(conversationId: string | undefined) {
  const dustAPI = useDustAPI();

  const { data, error, isLoading, mutate } = useSWR(
    conversationId ? `conversation-${conversationId}` : null,
    async () => {
      if (!conversationId) return null;
      const result = await dustAPI.getConversation({ conversationId });
      if (result.isErr()) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    swrConfig
  );

  const revalidate = useCallback(() => {
    mutate();
  }, [mutate]);

  useAppStateRevalidation(revalidate);

  return {
    conversation: data as ConversationPublicType | null | undefined,
    isLoading,
    error,
    mutate,
  };
}
