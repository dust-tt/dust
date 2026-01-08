import type { ConversationPublicType } from "@dust-tt/client";
import type { KeyedMutator } from "swr";

import { useSWRWithDefaults } from "@/lib/swr";
import { useDustAPI } from "@/lib/useDustAPI";

type ConversationKey =
  | ["getConversation", string, { conversationId: string }]
  | null;

export function useConversation({
  conversationId,
}: {
  conversationId: string | null;
}): {
  conversation: ConversationPublicType | null;
  isConversationLoading: boolean;
  conversationError: Error | undefined;
  mutateConversation:
    | (() => Promise<any>)
    | KeyedMutator<ConversationPublicType | null>;
} {
  const dustAPI = useDustAPI();

  const conversationFetcher = async (key: ConversationKey) => {
    if (!key) {
      return null;
    }
    const res = await dustAPI.getConversation(key[2]);
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate } = useSWRWithDefaults<
    ConversationKey,
    ConversationPublicType | null
  >(
    conversationId
      ? ["getConversation", dustAPI.workspaceId(), { conversationId }]
      : null,
    conversationFetcher
  );

  return {
    conversation: data ?? null,
    isConversationLoading: !error && !data,
    conversationError: error,
    mutateConversation: mutate,
  };
}
