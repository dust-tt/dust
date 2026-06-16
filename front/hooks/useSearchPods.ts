import type { SearchProjectsResponseBody } from "@app/lib/api/projects/lookup";
import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
} from "@app/lib/swr/swr";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fetcher } from "swr";

type PodsSearchResult = SearchProjectsResponseBody["spaces"][number];

interface UseSearchPodsParams {
  workspaceId: string;
  enabled?: boolean;
  query?: string;
  limit?: number;
}

export function useSearchPods({
  workspaceId,
  enabled = true,
  query = "",
  limit = 20,
}: UseSearchPodsParams) {
  const { fetcher } = useFetcher();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

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
