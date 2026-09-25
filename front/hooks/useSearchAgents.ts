import { useDebounce } from "@app/hooks/useDebounce";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
  AgentSearchSort,
  AgentSearchSortOrder,
  SearchAgentsResponseBody,
} from "@app/types/agent_search/agent_search";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect } from "react";
import { useSWRConfig } from "swr";

const SEARCH_AGENTS_DEBOUNCE_MS = 250;
const SEARCH_AGENTS_QUERY_MAX_LENGTH = 200;

export function useSearchAgents({
  owner,
  searchTerm,
  cursor,
  limit,
  sortBy,
  sortOrder,
  permissionFiltering,
  filters,
  disabled,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  cursor?: string | null;
  limit?: number;
  sortBy?: AgentSearchSort;
  sortOrder?: AgentSearchSortOrder;
  permissionFiltering?: AgentSearchPermissionFiltering;
  filters?: AgentSearchFilters;
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const { mutate: globalMutate } = useSWRConfig();
  const query = searchTerm.slice(0, SEARCH_AGENTS_QUERY_MAX_LENGTH);
  const { debouncedValue: debouncedSearchTerm, setValue: setSearchTerm } =
    useDebounce(query, { delay: SEARCH_AGENTS_DEBOUNCE_MS });
  const isDebouncing = query !== debouncedSearchTerm;

  useEffect(() => {
    setSearchTerm(query);
  }, [query, setSearchTerm]);

  const url = `/api/w/${owner.sId}/assistant/agent_configurations/search`;
  const body = {
    ...filters,
    query: debouncedSearchTerm,
    cursor,
    limit,
    sortBy,
    sortOrder,
    permissionFiltering,
  };
  const agentsFetcher: () => Promise<SearchAgentsResponseBody> = () =>
    fetcherWithBody([url, body, "POST"]);

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    [url, body],
    agentsFetcher,
    {
      disabled: disabled || isDebouncing,
      // Keep results visible while the next query debounces or loads, instead of
      // flashing a loading placeholder on every keystroke.
      keepPreviousData: true,
    }
  );

  // Search filters and cursors are in the body, so refresh every search key for this workspace.
  const mutateRegardlessOfQueryParams = useCallback(
    () => globalMutate((key) => Array.isArray(key) && key[0] === url),
    [globalMutate, url]
  );

  return {
    agents:
      (disabled ? undefined : data?.agents) ??
      emptyArray<SearchAgentsResponseBody["agents"][number]>(),
    hasMore: data?.hasMore ?? false,
    nextCursor: data?.nextCursor ?? null,
    isAgentsError: !!error,
    isAgentsLoading: !disabled && (isDebouncing || isLoading),
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
