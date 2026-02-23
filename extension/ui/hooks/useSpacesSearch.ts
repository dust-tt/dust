import type {
  ContentNodesViewType,
  DataSourceContentNodeType,
  SearchRequestBodyType,
} from "@dust-tt/client";
import { useDustAPI } from "@extension/shared/lib/dust_api";
import { useSWRWithDefaults } from "@extension/shared/lib/swr";
import { useMemo } from "react";

type SearchKey = ["searchNodes", string, SearchRequestBodyType];

export interface CursorPaginationParams {
  limit: number;
  cursor: string | null;
}

type BaseSearchParams = {
  disabled?: boolean;
  includeDataSources: boolean;
  spaceIds?: string[];
  viewType: ContentNodesViewType;
  pagination?: CursorPaginationParams;
};

// Text search variant
type TextSearchParams = BaseSearchParams & {
  search: string;
  nodeIds?: undefined;
  searchSourceUrls?: boolean;
};

// Node ID search variant
type NodeIdSearchParams = BaseSearchParams & {
  search?: undefined;
  nodeIds: string[];
  searchSourceUrls?: undefined;
};

type SpacesSearchParams = TextSearchParams | NodeIdSearchParams;

export function useSpacesSearch({
  disabled = false,
  includeDataSources = false,
  nodeIds,
  search,
  spaceIds,
  viewType,
  searchSourceUrls = false,
}: SpacesSearchParams) {
  const dustAPI = useDustAPI();

  const searchQuery: SearchRequestBodyType = useMemo(
    () => ({
      viewType,
      includeDataSources,
      ...(nodeIds ? { nodeIds } : { query: search }),
      spaceIds: spaceIds || [],
      limit: 100,
      searchSourceUrls,
    }),
    [viewType, includeDataSources, nodeIds, search, spaceIds]
  );

  const searchFetcher = async () => {
    if (disabled) {
      return null;
    }
    // Skip the query if no node IDs were extracted.
    // Example: a user pastes a Google Drive folder link
    // It matches a valid provider but we extract no node IDs,
    // and we don't want to support fetching all contents of a folder.
    if (!searchQuery.query && !searchQuery.nodeIds?.length) {
      return [];
    }
    const res = await dustAPI.searchNodes(searchQuery);
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate } = useSWRWithDefaults<
    SearchKey,
    DataSourceContentNodeType[] | null
  >(["searchNodes", dustAPI.workspaceId(), searchQuery], searchFetcher);

  return {
    searchResultNodes: useMemo(() => data ?? [], [data]),
    isSearchLoading: !error && !data,
    isSearchError: error,
    mutateSearch: mutate,
  };
}
