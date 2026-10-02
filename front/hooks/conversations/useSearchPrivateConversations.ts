import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
} from "@app/lib/swr/swr";
import type { SearchConversationsResponseBody } from "@app/types/api/assistant/conversation/search";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fetcher } from "swr";

type PrivateConversationSearchResult =
  SearchConversationsResponseBody["conversations"][number];

interface UseSearchPrivateConversationsParams {
  workspaceId: string;
  enabled?: boolean;
  query?: string;
  limit?: number;
  /** Set to 0 when the caller already debounces the search term. */
  debounceMs?: number;
}

export function useSearchPrivateConversations({
  workspaceId,
  enabled = true,
  query = "",
  limit = 20,
  debounceMs = 300,
}: UseSearchPrivateConversationsParams) {
  const { fetcher } = useFetcher();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    if (debounceMs <= 0) {
      setDebouncedQuery(query);
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const isDebouncing = query !== debouncedQuery;

  const shouldFetch = useMemo(() => {
    return !!(enabled && workspaceId && debouncedQuery.trim().length > 0);
  }, [enabled, workspaceId, debouncedQuery]);

  const searchFetcher: Fetcher<SearchConversationsResponseBody> = fetcher;

  const { data, error, size, setSize, isValidating } =
    useSWRInfiniteWithDefaults(
      (
        pageIndex: number,
        previousPageData: SearchConversationsResponseBody | null
      ) => {
        if (!shouldFetch) {
          return null;
        }

        if (previousPageData && !previousPageData.hasMore) {
          return null;
        }

        if (previousPageData === null) {
          return `/api/w/${workspaceId}/assistant/conversations/search?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}`;
        }

        return `/api/w/${workspaceId}/assistant/conversations/search?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}&lastValue=${previousPageData.lastValue}`;
      },
      searchFetcher,
      {
        revalidateAll: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }
    );

  const conversations = useMemo(() => {
    if (!data) {
      return emptyArray<PrivateConversationSearchResult>();
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
    conversations: conversations as ConversationWithoutContentType[],
    isSearching:
      (!error && !data && shouldFetch) || isDebouncing || isValidating,
    isLoadingMore: isValidating && size > 1,
    hasMore,
    loadMore,
    isSearchError: error,
    searchQuery: debouncedQuery,
  };
}
