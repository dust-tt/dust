import { useDebounce } from "@app/hooks/useDebounce";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  AgentSearchFacet,
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
  AgentSearchSort,
  AgentSearchSortOrder,
  SearchAgentsResponseBody,
} from "@app/types/agent_search/agent_search";
import type { SearchType } from "@app/types/api/search";
import { MIN_NAME_SEARCH_QUERY_LENGTH } from "@app/types/api/search";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect } from "react";
import { useSWRConfig } from "swr";

const SEARCH_AGENTS_DEBOUNCE_MS = 250;
const SEARCH_AGENTS_QUERY_MAX_LENGTH = 200;

/**
 * @cc [owner:aubin-tchoi,label:product] management-search-minimum-length
 * Name search sends an empty query below MIN_NAME_SEARCH_QUERY_LENGTH trimmed
 * characters. Autocomplete keeps accepting shorter input.
 */
export function useSearchAgents({
  owner,
  searchEndpoint,
  searchTerm,
  searchType = "autocomplete",
  offset,
  limit,
  sortBy,
  sortOrder,
  permissionFiltering,
  filters,
  facets,
  favoritesFirst,
  disabled,
  keepPreviousData = true,
  debounceMs = SEARCH_AGENTS_DEBOUNCE_MS,
}: {
  owner: LightWorkspaceType;
  searchEndpoint?: string;
  searchTerm: string;
  searchType?: SearchType;
  offset?: number;
  limit?: number;
  sortBy?: AgentSearchSort;
  sortOrder?: AgentSearchSortOrder;
  permissionFiltering?: AgentSearchPermissionFiltering;
  filters?: AgentSearchFilters;
  facets?: AgentSearchFacet[];
  favoritesFirst?: boolean;
  disabled?: boolean;
  /** When false, clear results while the next query loads (e.g. command palette). */
  keepPreviousData?: boolean;
  /** Set to 0 when the caller already debounces the search term. */
  debounceMs?: number;
}) {
  const { fetcherWithBody } = useFetcher();
  const { mutate: globalMutate } = useSWRConfig();
  const truncatedSearchTerm = searchTerm.slice(
    0,
    SEARCH_AGENTS_QUERY_MAX_LENGTH
  );
  const query =
    searchType === "name" &&
    truncatedSearchTerm.trim().length < MIN_NAME_SEARCH_QUERY_LENGTH
      ? ""
      : truncatedSearchTerm;
  const { debouncedValue: debouncedSearchTerm, setValue: setSearchTerm } =
    useDebounce(query, { delay: debounceMs });
  const isDebouncing = query !== debouncedSearchTerm;

  useEffect(() => {
    setSearchTerm(query);
  }, [query, setSearchTerm]);

  const url =
    searchEndpoint ??
    `/api/w/${owner.sId}/assistant/agent_configurations/search`;
  const body = {
    ...filters,
    query: debouncedSearchTerm,
    searchType,
    offset,
    limit,
    sortBy,
    sortOrder,
    permissionFiltering,
    facets,
    favoritesFirst,
  };
  const agentsFetcher: () => Promise<SearchAgentsResponseBody> = () =>
    fetcherWithBody([url, body, "POST"]);

  const { data, error, isLoading, isValidating, mutate } = useSWRWithDefaults(
    [url, body],
    agentsFetcher,
    {
      disabled: disabled || isDebouncing,
      // Keep results visible while the next query debounces or loads, instead of
      // flashing a loading placeholder on every keystroke.
      keepPreviousData,
    }
  );

  // Search filters and offsets are in the body, so refresh every search key for this workspace.
  const mutateRegardlessOfQueryParams = useCallback(
    () => globalMutate((key) => Array.isArray(key) && key[0] === url),
    [globalMutate, url]
  );

  return {
    agents:
      (disabled ? undefined : data?.agents) ??
      emptyArray<SearchAgentsResponseBody["agents"][number]>(),
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    facets: data?.facets,
    isAgentsError: !!error,
    isAgentsValidating: !disabled && isValidating,
    isAgentsLoading: !disabled && (isDebouncing || isLoading),
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
