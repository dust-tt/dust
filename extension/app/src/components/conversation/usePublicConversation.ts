import type { ConversationPublicType } from "@dust-tt/client";
import { logout } from "@extension/lib/auth";
import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import { useEffect } from "react";
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
    | KeyedMutator<ConversationPublicType>;
} {
  const dustAPI = useDustAPI();
  const conversationFetcher = async (key: any[]) => {
    if (!key) {
      return null;
    }
    const res = await dustAPI.getConversation(key[2]);
    if (res.isOk()) {
      return res.value;
    }
    throw new Error(res.error.message);
  };

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? ["getConversation", dustAPI.workspaceId(), { conversationId }]
      : null,
    conversationFetcher
  );

  useEffect(() => {
    if (
      typeof error?.message === "string" &&
      error?.message.includes("User not found")
    ) {
      void logout();
    }
  }, [error]);

  return {
    conversation: data ? data : null,
    isConversationLoading: !error && !data,
    conversationError: error,
    mutateConversation: mutate,
  };
}
