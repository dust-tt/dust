import { useMemo } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { useDebounce } from "@app/hooks/useDebounce";
import { emptyArray, fetcher } from "@app/lib/swr/swr";
import type { SearchConversationsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/search_conversations";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

interface UseSearchConversationsParams {
  workspaceId: string;
  spaceId: string;
  limit?: number;
  enabled?: boolean;
  initialSearchText?: string;
}

export function useSearchConversations({
  workspaceId,
  spaceId,
  limit = 10,
  enabled = true,
  initialSearchText = "",
}: UseSearchConversationsParams) {
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
      spaceId
    );
  }, [enabled, debouncedQuery, workspaceId, spaceId]);

  const searchKey = shouldFetch
    ? `/api/w/${workspaceId}/spaces/${spaceId}/search_conversations?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}`
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
