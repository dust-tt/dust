import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { SearchConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/search";
import { useEffect, useMemo, useState } from "react";

type ProjectConversationSearchResult =
  SearchConversationsResponseBody["conversations"][number];

interface UseSearchProjectConversationsParams {
  workspaceId: string;
  enabled?: boolean;
  query?: string;
  limit?: number;
}

export function useSearchProjectConversations({
  workspaceId,
  enabled = true,
  query = "",
  limit = 50,
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

  const { data, error, isValidating } = useSWRWithDefaults<
    string | null,
    SearchConversationsResponseBody
  >(
    shouldFetch
      ? `/api/w/${workspaceId}/assistant/conversations/search?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const conversations = useMemo(() => {
    if (!data) {
      return emptyArray<ProjectConversationSearchResult>();
    }
    return data.conversations;
  }, [data]);

  return {
    conversations,
    isSearching:
      (!error && !data && shouldFetch) || isDebouncing || isValidating,
    isSearchError: error,
    searchQuery: debouncedQuery,
  };
}
