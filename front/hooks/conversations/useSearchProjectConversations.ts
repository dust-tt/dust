import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { SemanticSearchConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/semantic_search";
import { useEffect, useMemo, useState } from "react";

type ProjectConversationSearchResult =
  SemanticSearchConversationsResponseBody["conversations"][number];

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
  const { fetcher } = useFetcher();
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
      () =>
        data?.conversations ?? emptyArray<ProjectConversationSearchResult>(),
      [data?.conversations]
    ),
    isSearching:
      isDebouncing || (!error && !data && shouldFetch) || isValidating,
    isError: !!error,
  };
}
