import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
} from "@app/lib/swr/swr";
import type { GetConversationsResponseBody } from "@app/types/api/assistant/conversation/types";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";
import type { SWRInfiniteMutatorOptions } from "swr/infinite";

const DEFAULT_LIMIT = 100;
const CONVERSATIONS_FOCUS_THROTTLE_INTERVAL_MS = 60 * 1000; // 1 minute

type ConversationsUpdater = (
  prevData: ConversationListItemType[] | undefined
) => ConversationListItemType[] | undefined;

type MutateOptions = {
  revalidate?: boolean;
};

export function useConversations({
  workspaceId,
  limit = DEFAULT_LIMIT,
  options,
}: {
  workspaceId: string;
  limit?: number;
  options?: { disabled?: boolean };
}) {
  const { fetcher } = useFetcher();
  const conversationsFetcher: Fetcher<GetConversationsResponseBody> = fetcher;

  const { data, error, mutate, size, setSize, isValidating } =
    useSWRInfiniteWithDefaults(
      (
        pageIndex: number,
        previousPageData: GetConversationsResponseBody | null
      ) => {
        if (previousPageData && !previousPageData.hasMore) {
          return null;
        }

        const baseUrl = `/api/w/${workspaceId}/assistant/conversations?limit=${limit}`;

        if (previousPageData === null) {
          return baseUrl;
        }

        return `${baseUrl}&lastValue=${previousPageData.lastValue}`;
      },
      conversationsFetcher,
      {
        // Personal conversations are kept fresh via optimistic cache writes in
        // ConversationViewer and action hooks. Revalidate on focus/reconnect as
        // a safety net.
        revalidateAll: false,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        focusThrottleInterval: CONVERSATIONS_FOCUS_THROTTLE_INTERVAL_MS,
        disabled: options?.disabled,
      }
    );

  const conversations = useMemo(() => {
    if (!data) {
      return emptyArray<ConversationListItemType>();
    }
    return data.flatMap((page) => page.conversations);
  }, [data]);

  const hasMore = data ? (data[data.length - 1]?.hasMore ?? false) : false;

  const loadMore = useCallback(() => {
    if (hasMore && !isValidating) {
      void setSize(size + 1);
    }
  }, [hasMore, isValidating, setSize, size]);

  const mutateConversations = useCallback(
    (updater?: ConversationsUpdater, options?: MutateOptions) => {
      if (!updater) {
        return mutate();
      }

      const swrOptions: SWRInfiniteMutatorOptions<
        GetConversationsResponseBody[]
      > = {
        revalidate: options?.revalidate ?? false,
      };

      return mutate((prevPages) => {
        if (!prevPages) {
          return prevPages;
        }

        const allConversations = prevPages.flatMap(
          (page) => page.conversations
        );
        const updatedConversations = updater(allConversations);

        if (!updatedConversations) {
          return prevPages;
        }

        let offset = 0;
        return prevPages.map((page, index) => {
          const isLastPage = index === prevPages.length - 1;
          const conversations = updatedConversations.slice(
            offset,
            isLastPage ? undefined : offset + page.conversations.length
          );
          offset += page.conversations.length;
          return { ...page, conversations };
        });
      }, swrOptions);
    },
    [mutate]
  );

  return {
    conversations,
    isConversationsLoading: !error && !data && !options?.disabled,
    isConversationsError: error,
    mutateConversations,
    hasMore,
    loadMore,
    isLoadingMore: isValidating && size > 1,
  };
}
