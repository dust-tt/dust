import { useDustAPI } from "@app/shared/lib/dust_api";
import { useSWRWithDefaults } from "@app/shared/lib/swr";
import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import { useMemo } from "react";

type ConversationsKey = ["getConversations", string];

export function useConversations() {
  const dustAPI = useDustAPI();
  const conversationsFetcher = async () => {
    const res = await dustAPI.getConversations();
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate } = useSWRWithDefaults<
    ConversationsKey,
    ConversationWithoutContentPublicType[]
  >(["getConversations", dustAPI.workspaceId()], conversationsFetcher);

  return {
    conversations: useMemo(() => data ?? [], [data]),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}
