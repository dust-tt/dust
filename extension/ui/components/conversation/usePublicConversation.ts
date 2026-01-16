import { useDustAPI } from "@app/shared/lib/dust_api";
import { createConversationFetcher } from "@app/shared/lib/fetchers";
import { useSWRWithDefaults } from "@app/shared/lib/swr";
import type { ConversationPublicType } from "@dust-tt/client";
import type { KeyedMutator } from "swr";
import { useMemo } from "react";

type ConversationKey =
  | ["getConversation", string, { conversationId: string }]
  | null;

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
    conversation: data ? data : null,
    isConversationLoading: !error && !data,
    conversationError: error,
    mutateConversation: mutate,
  };
}
