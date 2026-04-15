import type { CursorPaginationParams } from "@app/lib/api/pagination";
import type {
  FetchDataSourceViewContentNodesOptions,
  InfiniteContentNodesResult,
} from "@app/lib/swr/data_source_views";
import { processInfiniteContentNodesData } from "@app/lib/swr/data_source_views";
import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  DataSourceViewWithUsage,
  PokeListDataSourceViews,
} from "@app/pages/api/poke/workspaces/[wId]/data_source_views";
import type { PokeGetDataSourceViewContentNodes } from "@app/pages/api/poke/workspaces/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/content-nodes";
import type { GetContentNodesOrChildrenRequestBodyType } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/content-nodes";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import type { Fetcher, KeyedMutator } from "swr";

export function usePokeDataSourceViews({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
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
  const { fetcherWithBody } = useFetcher();
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

const makePokeURLDataSourceViewContentNodes = (
  {
    owner,
    dataSourceView,
  }: Required<
    Pick<FetchDataSourceViewContentNodesOptions, "owner" | "dataSourceView">
  >,
  searchParams: URLSearchParams
): string => {
  return `/api/poke/workspaces/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/content-nodes?${searchParams}`;
};

export function usePokeInfiniteDataSourceViewContentNodes({
  owner,
  dataSourceView,
  pagination,
  internalIds,
  parentId,
  viewType,
  sorting,
  swrOptions,
}: FetchDataSourceViewContentNodesOptions): InfiniteContentNodesResult {
  const { fetcherWithBody } = useFetcher();
  const { data, error, isLoading, size, setSize, mutate, isValidating } =
    useSWRInfiniteWithDefaults<
      [string, GetContentNodesOrChildrenRequestBodyType] | null,
      PokeGetDataSourceViewContentNodes
    >(
      (_pageIndex, previousPageData) => {
        if (
          (previousPageData && !previousPageData.nextPageCursor) ||
          !dataSourceView
        ) {
          return null;
        }

        const params = new URLSearchParams();
        if (previousPageData?.nextPageCursor) {
          params.append("cursor", previousPageData.nextPageCursor);
        }

        if (pagination?.limit) {
          params.append("limit", pagination.limit.toString());
        }

        const body: GetContentNodesOrChildrenRequestBodyType = {
          internalIds,
          parentId,
          viewType: viewType ?? "all",
          sorting,
        };

        return [
          makePokeURLDataSourceViewContentNodes(
            { owner, dataSourceView },
            params
          ),
          body,
        ];
      },
      async ([url, body]) => {
        return fetcherWithBody([url, body, "POST"]);
      },
      {
        revalidateAll: false,
        revalidateFirstPage: false,
        ...swrOptions,
      }
    );

  const loadMore = useCallback(() => setSize((s) => s + 1), [setSize]);
  const processed = processInfiniteContentNodesData({
    data,
    error,
    isLoading,
    size,
    isValidating,
  });

  return { ...processed, loadMore, mutate };
}
