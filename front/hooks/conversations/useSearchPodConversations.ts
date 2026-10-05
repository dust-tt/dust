import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { SemanticSearchConversationsResponseBody } from "@app/types/api/assistant/conversation/semantic_search";
import { useEffect, useMemo, useState } from "react";

type PodConversationSearchResult =
  SemanticSearchConversationsResponseBody["conversations"][number];

interface UseSearchPodConversationsParams {
  workspaceId: string;
  enabled?: boolean;
  query?: string;
  limit?: number;
  /** Set to 0 when the caller already debounces the search term. */
  debounceMs?: number;
}

export function useSearchPodConversations({
  workspaceId,
  enabled = true,
  query = "",
  limit = 50,
  debounceMs = 300,
}: UseSearchPodConversationsParams) {
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

  const { data, error, isValidating } = useSWRWithDefaults<
    string | null,
    SemanticSearchConversationsResponseBody
  >(
    shouldFetch
      ? `/api/w/${workspaceId}/assistant/conversations/semantic_search?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 500,
    }
  );

  return {
    conversations: useMemo(
      () => data?.conversations ?? emptyArray<PodConversationSearchResult>(),
      [data?.conversations]
    ),
    isSearching:
      isDebouncing || (!error && !data && shouldFetch) || isValidating,
    isError: !!error,
    searchQuery: debouncedQuery,
  };
}
