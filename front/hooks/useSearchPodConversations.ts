import { useDebounce } from "@app/hooks/useDebounce";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { SearchConversationsResponseBody } from "@app/types/api/projects/search";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { useMemo } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

interface UseSearchPodConversationsParams {
  workspaceId: string;
  podId: string;
  limit?: number;
  enabled?: boolean;
  initialSearchText?: string;
}

export function useSearchPodConversations({
  workspaceId,
  podId,
  limit = 10,
  enabled = true,
  initialSearchText = "",
}: UseSearchPodConversationsParams) {
  const { fetcher } = useFetcher();
  const {
    debouncedValue: debouncedQuery,
    isDebouncing,
    inputValue,
    setValue,
  } = useDebounce(initialSearchText, {
    delay: 300,
    minLength: 1,
  });

  const shouldFetch = useMemo(() => {
    return !!(
      enabled &&
      debouncedQuery.trim().length > 0 &&
      workspaceId &&
      podId
    );
  }, [enabled, debouncedQuery, workspaceId, podId]);

  const searchKey = shouldFetch
    ? `/api/w/${workspaceId}/spaces/${podId}/search_conversations?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}`
    : null;

  const searchFetcher: Fetcher<SearchConversationsResponseBody> = fetcher;

  const { data, error, isLoading, isValidating } = useSWR(
    searchKey,
    searchFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return {
    conversations:
      data?.conversations ?? emptyArray<ConversationWithoutContentType>(),
    isSearching: isLoading || isValidating || isDebouncing,
    isSearchError: error,
    searchQuery: debouncedQuery,
    inputValue,
    setValue,
  };
}
