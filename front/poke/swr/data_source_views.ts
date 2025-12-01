import { useMemo } from "react";
import type { Fetcher, KeyedMutator } from "swr";

import type { CursorPaginationParams } from "@app/lib/api/pagination";
import {
  emptyArray,
  fetcher,
  fetcherWithBody,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  DataSourceViewWithUsage,
  PokeListDataSourceViews,
} from "@app/pages/api/poke/workspaces/[wId]/data_source_views";
import type { PokeGetDataSourceViewContentNodes } from "@app/pages/api/poke/workspaces/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/content-nodes";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@app/types";

export function usePokeDataSourceViews({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const dataSourceViewsFetcher: Fetcher<PokeListDataSourceViews> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_source_views`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: data?.data_source_views ?? emptyArray<DataSourceViewWithUsage>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export interface DataSourceViewContentNodesProps {
  dataSourceView?: DataSourceViewType;
  disabled?: boolean;
  internalIds?: string[];
  owner: LightWorkspaceType;
  pagination?: CursorPaginationParams;
  parentId?: string;
  viewType?: ContentNodesViewType;
}

export function usePokeDataSourceViewContentNodes({
  dataSourceView,
  disabled = false,
  internalIds,
  owner,
  pagination,
  parentId,
  viewType,
}: DataSourceViewContentNodesProps): {
  isNodesError: boolean;
  isNodesLoading: boolean;
  isNodesValidating: boolean;
  mutate: KeyedMutator<PokeGetDataSourceViewContentNodes>;
  mutateRegardlessOfQueryParams: KeyedMutator<PokeGetDataSourceViewContentNodes>;
  nodes: PokeGetDataSourceViewContentNodes["nodes"];
  totalNodesCount: number;
  totalNodesCountIsAccurate: boolean;
  nextPageCursor: string | null;
} {
  const params = new URLSearchParams();
  if (pagination && pagination.cursor) {
    params.set("cursor", pagination.cursor.toString());
  }
  if (pagination && pagination.limit) {
    params.set("limit", pagination.limit.toString());
  }

  const url =
    dataSourceView && viewType
      ? `/api/poke/workspaces/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/content-nodes?${params}`
      : null;

  const body = JSON.stringify({
    internalIds,
    parentId,
    viewType,
  });

  const fetchKey = useMemo(() => {
    return JSON.stringify({
      url,
      body,
    }); // Serialize with body to ensure uniqueness.
  }, [url, body]);

  const { data, error, mutate, isValidating, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      fetchKey,
      async () => {
        if (!url) {
          return undefined;
        }

        return fetcherWithBody([
          url,
          { internalIds, parentId, viewType },
          "POST",
        ]);
      },
      {
        disabled: disabled || !viewType,
      }
    );

  return {
    isNodesError: !!error,
    isNodesLoading: !error && !data && !disabled,
    isNodesValidating: isValidating,
    mutate,
    mutateRegardlessOfQueryParams,
    nodes: data?.nodes ?? emptyArray(),
    totalNodesCount: data ? data.total : 0,
    totalNodesCountIsAccurate: data ? data.totalIsAccurate : true,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    nextPageCursor: data?.nextPageCursor || null,
  };
}
