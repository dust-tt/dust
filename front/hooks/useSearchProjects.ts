import { useMemo } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { useDebounce } from "@app/hooks/useDebounce";
import { emptyArray, fetcher } from "@app/lib/swr/swr";
import type { SearchProjectsResponseBody } from "@app/pages/api/w/[wId]/spaces/search_projects";

type ProjectSearchResult = SearchProjectsResponseBody["projects"][number];

interface UseSearchProjectsParams {
  workspaceId: string;
  enabled?: boolean;
  initialSearchText?: string;
}

export function useSearchProjects({
  workspaceId,
  enabled = true,
  initialSearchText = "",
}: UseSearchProjectsParams) {
  const {
    debouncedValue: debouncedQuery,
    isDebouncing,
    inputValue,
    setValue,
  } = useDebounce(initialSearchText, {
    delay: 300,
    minLength: 0,
  });

  const shouldFetch = useMemo(() => {
    return !!(enabled && workspaceId);
  }, [enabled, workspaceId]);

  const searchKey = shouldFetch
    ? `/api/w/${workspaceId}/spaces/search_projects?query=${encodeURIComponent(debouncedQuery)}`
    : null;

  const searchFetcher: Fetcher<SearchProjectsResponseBody> = fetcher;

  const { data, error, isLoading, isValidating } = useSWR(
    searchKey,
    searchFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return {
    projects: data?.projects ?? emptyArray<ProjectSearchResult>(),
    isSearching: isLoading || isValidating || isDebouncing,
    isSearchError: error,
    searchQuery: debouncedQuery,
    inputValue,
    setValue,
  };
}
