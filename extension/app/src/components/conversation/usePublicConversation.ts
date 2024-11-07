import type { ConversationPublicType } from "@dust-tt/client";
import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import type { KeyedMutator } from "swr";

export function usePublicConversation({
  conversationId,
}: {
  conversationId: string | null;
}): {
  conversation: ConversationPublicType | null;
  isConversationLoading: boolean;
  conversationError: Error;
  mutateConversation:
    | (() => Promise<any>)
    | KeyedMutator<{
        conversation: ConversationPublicType;
      }>;
} {
  const dustAPI = useDustAPI();
  const conversationFetcher = async (key: any[]) => {
    if (!key) {
      return null;
    }
    const res = await dustAPI.getConversation(key[1]);
    if (res.isOk()) {
      return res.value;
    }
    throw new Error(res.error.message);
  };

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? [
          `/api/v1/w/${dustAPI.workspaceId}/assistant/conversations/`,
          { conversationId },
        ]
      : null,
    conversationFetcher
  );

  return {
    conversation: data ? data : null,
    isConversationLoading: !error && !data,
    conversationError: error,
    mutateConversation: mutate,
  };
}
