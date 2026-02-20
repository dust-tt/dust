import {
  useFetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { FetchConversationMessagesResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages";
import type { FetchConversationMessageResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversationMessages({
  conversationId,
  workspaceId,
  limit,
}: {
  conversationId?: string | null;
  workspaceId: string;
  limit: number;
  startAtRank?: number;
}) {
  const { fetcher } = useFetcher();
  const messagesFetcher: Fetcher<FetchConversationMessagesResponse> = fetcher;

  const { data, error, mutate, size, setSize, isLoading, isValidating } =
    useSWRInfiniteWithDefaults(
      (pageIndex: number, previousPageData) => {
        if (!conversationId) {
          return null;
        }

        // If we have reached the last page and there are no more
        // messages or the previous page has no messages, return null.
        if (
          previousPageData &&
          (previousPageData.messages.length === 0 || !previousPageData.hasMore)
        ) {
          return null;
        }

        if (previousPageData === null) {
          return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages?newResponseFormat=1&orderDirection=desc&orderColumn=rank&limit=${limit}`;
        }

        return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages?newResponseFormat=1&lastValue=${previousPageData.lastValue}&orderDirection=desc&orderColumn=rank&limit=${limit}`;
      },
      messagesFetcher,
      {
        revalidateAll: false,
        revalidateOnFocus: false,
      }
    );

  return {
    isLoadingInitialData: !error && !data,
    isMessagesError: error,
    isMessagesLoading: isLoading,
    isValidating,
    messages: useMemo(() => (data ? [...data].reverse() : []), [data]),
    mutateMessages: mutate,
    setSize,
    size,
  };
}

export function useConversationMessage({
  conversationId,
  workspaceId,
  messageId,
  options,
}: {
  conversationId: string;
  workspaceId: string;
  messageId: string | null;
  options?: {
    disabled: boolean;
  };
}) {
  const { fetcher } = useFetcher();
  const messageFetcher: Fetcher<FetchConversationMessageResponse> = fetcher;

  const { data, error, mutate, isLoading, isValidating } = useSWRWithDefaults(
    messageId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}`
      : null,
    messageFetcher,
    options
  );

  return {
    message: data?.message,
    isMessageError: error,
    isMessageLoading: isLoading,
    isValidating,
    mutateMessage: mutate,
  };
}
