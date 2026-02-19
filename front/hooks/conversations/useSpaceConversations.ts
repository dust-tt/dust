import {
  emptyArray,
  fetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetBySpacesSummaryResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces";
import type { GetSpaceConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces/[spaceId]";
import type { GetSpaceUnreadConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces/[spaceId]/unread";
import type { LightConversationType } from "@app/types/assistant/conversation";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

export function useSpaceConversationsSummary({
  workspaceId,
  options,
}: {
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const summaryFetcher: Fetcher<GetBySpacesSummaryResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations/spaces`,
    summaryFetcher,
    options
  );

  return {
    summary: data?.summary ?? emptyArray(),
    isLoading: !error && !data && !options?.disabled,
    isError: !!error,
    mutate,
  };
}

const DEFAULT_CONVERSATIONS_PAGE_SIZE = 12;

export function useSpaceConversations({
  workspaceId,
  spaceId,
  limit = DEFAULT_CONVERSATIONS_PAGE_SIZE,
}: {
  workspaceId: string;
  spaceId: string | null;
  limit?: number;
}) {
  const conversationsFetcher: Fetcher<GetSpaceConversationsResponseBody> =
    fetcher;

  const { data, error, mutate, size, setSize, isValidating } =
    useSWRInfiniteWithDefaults(
      (
        pageIndex: number,
        previousPageData: GetSpaceConversationsResponseBody | null
      ) => {
        if (!spaceId) {
          return null;
        }

        if (previousPageData === null) {
          return `/api/w/${workspaceId}/assistant/conversations/spaces/${spaceId}`;
        }

        if (!previousPageData.hasMore) {
          return null;
        }

        return `/api/w/${workspaceId}/assistant/conversations/spaces/${spaceId}?lastValue=${previousPageData.lastValue}&limit=${limit}`;
      },
      conversationsFetcher,
      {
        revalidateAll: false,
        revalidateOnFocus: false,
      }
    );

  const conversations = useMemo(() => {
    if (!data) {
      return emptyArray<LightConversationType>();
    }
    return data.flatMap((page) => page.conversations);
  }, [data]);

  const hasMore = data ? (data[data.length - 1]?.hasMore ?? false) : false;

  const loadMore = useCallback(() => {
    if (hasMore && !isValidating) {
      void setSize(size + 1);
    }
  }, [hasMore, isValidating, setSize, size]);

  return {
    conversations,
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    isLoadingMore: isValidating && size > 1,
    isValidating,
    hasMore,
    loadMore,
    mutateConversations: mutate,
  };
}

export function useSpaceUnreadConversationIds({
  workspaceId,
  spaceId,
  options,
}: {
  workspaceId: string;
  spaceId: string | null;
  options?: { disabled: boolean };
}) {
  const conversationsFetcher: Fetcher<GetSpaceUnreadConversationsResponseBody> =
    fetcher;

  const { data, isLoading, mutate } = useSWRWithDefaults(
    spaceId
      ? `/api/w/${workspaceId}/assistant/conversations/spaces/${spaceId}/unread`
      : null,
    conversationsFetcher,
    {
      disabled: options?.disabled ?? !spaceId,
    }
  );

  const unreadConversationIds = useMemo(() => {
    if (!data) {
      return emptyArray<string>();
    }
    return data.unreadConversationIds;
  }, [data]);

  return {
    unreadConversationIds,
    isLoading: isLoading && !options?.disabled,
    mutateUnreadConversationIds: mutate,
  };
}
