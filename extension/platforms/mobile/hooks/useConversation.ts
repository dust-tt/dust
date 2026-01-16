import type { ConversationPublicType } from "@dust-tt/client";
import type { KeyedMutator } from "swr";
import { useMemo } from "react";

import { createConversationFetcher } from "@app/shared/lib/fetchers";
import { useAuth } from "@/contexts/AuthContext";
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
  const { isAuthenticated } = useAuth();
  const dustAPI = useDustAPI({ disabled: !isAuthenticated });

  const fetcher = useMemo(
    () => createConversationFetcher(dustAPI),
    [dustAPI]
  );

  const { data, error, mutate } = useSWRWithDefaults<
    ConversationKey,
    ConversationPublicType | null
  >(
    dustAPI && conversationId
      ? ["getConversation", dustAPI.workspaceId(), { conversationId }]
      : null,
    fetcher
  );

  return {
    conversation: data ?? null,
    isConversationLoading: !error && !data,
    conversationError: error,
    mutateConversation: mutate,
  };
}
