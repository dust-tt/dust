import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import { useMemo } from "react";

import { createConversationsFetcher } from "@app/shared/lib/fetchers";
import { useAuth } from "@/contexts/AuthContext";
import { useSWRWithDefaults } from "@/lib/swr";
import { useDustAPI } from "@/lib/useDustAPI";

type ConversationsKey = ["getConversations", string] | null;

export function useConversations() {
  const { isAuthenticated } = useAuth();
  const dustAPI = useDustAPI({ disabled: !isAuthenticated });

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
