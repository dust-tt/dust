import type { GetConversationsResponseType } from "@dust-tt/client";
import { fetcher, useSWRWithDefaults } from "@extension/lib/swr";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversations({ workspaceId }: { workspaceId: string }) {
  const conversationFetcher: Fetcher<GetConversationsResponseType> = fetcher;

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
