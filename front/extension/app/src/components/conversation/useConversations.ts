import type { ConversationWithoutContentType } from "@dust-tt/types";
import { fetcher, useSWRWithDefaults } from "@extension/lib/swr";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversations({ workspaceId }: { workspaceId: string }) {
  const conversationFetcher: Fetcher<{
    conversations: ConversationWithoutContentType[];
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/v1/w/${workspaceId}/assistant/conversations`,
    conversationFetcher
  );

  return {
    conversations: useMemo(() => (data ? data.conversations : []), [data]),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}
