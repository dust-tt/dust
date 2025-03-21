import { useDustAPI } from "@app/shared/lib/dust_api";
import { useSWRWithDefaults } from "@app/shared/lib/swr";
import type {
  ContentNodesViewType,
  DataSourceContentNodeType,
  SearchRequestBodyType,
} from "@dust-tt/client";
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
};

// Node ID search variant
type NodeIdSearchParams = BaseSearchParams & {
  search?: undefined;
  nodeIds: string[];
};
type SpacesSearchParams = TextSearchParams | NodeIdSearchParams;

export function useSpacesSearch({
  disabled = false,
  includeDataSources = false,
  nodeIds,
  search,
  spaceIds,
  viewType,
}: SpacesSearchParams) {
  const dustAPI = useDustAPI();

  const searchQuery: SearchRequestBodyType = useMemo(
    () => ({
      viewType,
      includeDataSources,
      ...(nodeIds ? { nodeIds } : { query: search }),
      spaceIds: spaceIds || [],
      limit: 100,
    }),
    [viewType, includeDataSources, nodeIds, search, spaceIds]
  );

  const searchFetcher = async () => {
    if (disabled) {
      return null;
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
