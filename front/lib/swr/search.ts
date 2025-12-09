import type { Fetcher } from "swr";

import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types";

interface ToolSearchResponse {
  results: ToolSearchResult[];
  resultsCount: number;
}

export function useSearchToolFiles({
  owner,
  query,
  pageSize = 25,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  query: string;
  pageSize?: number;
  disabled?: boolean;
}) {
  const searchFetcher: Fetcher<ToolSearchResponse> = fetcher;
  const url =
    query && query.length >= 3 && !disabled
      ? `/api/w/${owner.sId}/search/tools?query=${encodeURIComponent(query)}&pageSize=${pageSize}`
      : null;

  const { data, error, isLoading, isValidating } = useSWRWithDefaults(
    url,
    searchFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return {
    searchResults: data?.results ?? emptyArray<ToolSearchResult>(),
    resultsCount: data?.resultsCount ?? 0,
    isSearchLoading: isLoading,
    isSearchValidating: isValidating,
    isSearchError: error,
  };
}
