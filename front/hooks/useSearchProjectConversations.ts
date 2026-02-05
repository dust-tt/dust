import { useEffect, useMemo, useState } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { emptyArray, fetcher } from "@app/lib/swr/swr";
import type { SearchConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/search";
import type { ConversationWithoutContentType } from "@app/types";

type ProjectConversationSearchResult = ConversationWithoutContentType & {
  spaceName: string;
};

interface UseSearchProjectConversationsParams {
  workspaceId: string;
  enabled?: boolean;
  query?: string;
}

export function useSearchProjectConversations({
  workspaceId,
  enabled = true,
  query = "",
}: UseSearchProjectConversationsParams) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const isDebouncing = query !== debouncedQuery;

  const shouldFetch = useMemo(() => {
    return !!(enabled && workspaceId && debouncedQuery.trim().length > 0);
  }, [enabled, workspaceId, debouncedQuery]);

  const searchKey = shouldFetch
    ? `/api/w/${workspaceId}/assistant/conversations/search?query=${encodeURIComponent(debouncedQuery)}&limit=50`
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
      data?.conversations ?? emptyArray<ProjectConversationSearchResult>(),
    isSearching: isLoading || isValidating || isDebouncing,
    isSearchError: error,
    searchQuery: debouncedQuery,
  };
}
