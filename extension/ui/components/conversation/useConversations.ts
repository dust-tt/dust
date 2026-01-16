import { useDustAPI } from "@app/shared/lib/dust_api";
import { createConversationsFetcher } from "@app/shared/lib/fetchers";
import { useSWRWithDefaults } from "@app/shared/lib/swr";
import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import { useMemo } from "react";

type ConversationsKey = ["getConversations", string] | null;

export function useConversations() {
  const dustAPI = useDustAPI();

  const fetcher = useMemo(
    () => createConversationsFetcher(dustAPI),
    [dustAPI]
  );

  const { data, error, mutate } = useSWRWithDefaults<
    ConversationsKey,
    ConversationWithoutContentPublicType[]
  >(
    dustAPI ? ["getConversations", dustAPI.workspaceId()] : null,
    fetcher
  );

  return {
    conversations: useMemo(() => data ?? [], [data]),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}
