import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
} from "@app/lib/swr/swr";
import type { SearchProjectsResponseBody } from "@app/types/api/projects/list";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fetcher } from "swr";

type PodsSearchResult = SearchProjectsResponseBody["spaces"][number];

interface UseSearchPodsParams {
  workspaceId: string;
  enabled?: boolean;
  query?: string;
  limit?: number;
  /** Set to 0 when the caller already debounces the search term. */
  debounceMs?: number;
}

export function useSearchPods({
  workspaceId,
  enabled = true,
  query = "",
  limit = 20,
  debounceMs = 300,
}: UseSearchPodsParams) {
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
    return !!(enabled && workspaceId);
  }, [enabled, workspaceId]);

  const searchFetcher: Fetcher<SearchProjectsResponseBody> = fetcher;

  const { data, error, size, setSize, isValidating } =
    useSWRInfiniteWithDefaults(
      (
        pageIndex: number,
        previousPageData: SearchProjectsResponseBody | null
      ) => {
        if (!shouldFetch) {
          return null;
        }

        // Stop if previous page returned hasMore: false
        if (previousPageData && !previousPageData.hasMore) {
          return null;
        }

        // First page - no lastValue
        if (previousPageData === null) {
          return `/api/w/${workspaceId}/spaces/search_projects?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}`;
        }

        // Subsequent pages - include lastValue
        return `/api/w/${workspaceId}/spaces/search_projects?query=${encodeURIComponent(debouncedQuery)}&limit=${limit}&lastValue=${previousPageData.lastValue}`;
      },
      searchFetcher,
      {
        revalidateAll: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }
    );

  const pods = useMemo(() => {
    if (!data) {
      return emptyArray<PodsSearchResult>();
    }
    return data.flatMap((page) => page.spaces);
  }, [data]);

  const hasMore = data ? (data[data.length - 1]?.hasMore ?? false) : false;

  const loadMore = useCallback(() => {
    if (hasMore && !isValidating) {
      void setSize(size + 1);
    }
  }, [hasMore, isValidating, setSize, size]);

  return {
    pods,
    isSearching: (!error && !data) || isDebouncing || isValidating,
    isLoadingMore: isValidating && size > 1,
    hasMore,
    loadMore,
    isSearchError: error,
    searchQuery: debouncedQuery,
  };
}
