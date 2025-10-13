import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fetcher, KeyedMutator, SWRConfiguration } from "swr";

import type {
  CursorPaginationParams,
  SortingParams,
} from "@app/lib/api/pagination";
import {
  emptyArray,
  fetcher,
  fetcherWithBody,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GetDataSourceViewsResponseBody } from "@app/pages/api/w/[wId]/data_source_views";
import type { PostTagSearchBody } from "@app/pages/api/w/[wId]/data_source_views/tags/search";
import type {
  GetContentNodesOrChildrenRequestBodyType,
  GetDataSourceViewContentNodes,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/content-nodes";
import type { GetDataSourceConfigurationResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/configuration";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

type DataSourceViewsAndInternalIds = {
  dataSourceView: DataSourceViewType;
  internalIds: string[];
};
type DataSourceViewsAndNodes = {
  dataSourceView: DataSourceViewType;
  nodes: GetDataSourceViewContentNodes["nodes"];
};

export function useDataSourceViews(
  owner: LightWorkspaceType,
  options = { disabled: false }
) {
  const { disabled } = options;
  const dataSourceViewsFetcher: Fetcher<GetDataSourceViewsResponseBody> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_source_views`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    dataSourceViews: data?.dataSourceViews ?? emptyArray(),
    isDataSourceViewsLoading: disabled ? false : !error && !data,
    isDataSourceViewsError: disabled ? false : error,
    mutateDataSourceViews: mutate,
  };
}

/*
 * This is a helper function to fetch the content-nodes of multiple data source views at once.
 * As it has to be exhaustive, it sometimes needs to fetch multiple pages of content-nodes.
 * We are using fetch() instead of SWR hooks as we want to call fetch() imperatively.
 * Maybe it's possible using SWR hooks, but I don't know how to do it.
 */
export function useMultipleDataSourceViewsContentNodes({
  dataSourceViewsAndInternalIds,
  owner,
  viewType,
}: {
  dataSourceViewsAndInternalIds: DataSourceViewsAndInternalIds[];
  owner: LightWorkspaceType;
  viewType: ContentNodesViewType;
}): {
  dataSourceViewsAndNodes: DataSourceViewsAndNodes[];
  isNodesLoading: boolean;
  isNodesError: boolean;
  // We need to return an invalidation function to avoid stale data.
  invalidate: () => void;
} {
  const [dataSourceViewsAndNodes, setDataSourceViewsAndNodes] =
    useState<DataSourceViewsAndNodes[]>(emptyArray());
  const [isNodesLoading, setIsNodesLoading] = useState(false);
  const [isNodesError, setIsNodesError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsNodesLoading(true);
      setIsNodesError(false);

      const dsvIdToNodes: Map<string, GetDataSourceViewContentNodes["nodes"]> =
        new Map();
      const MAX_ITERATIONS = 50;
      const NODES_PER_PAGE = 500; // Upper-limit server side.
      const dsvIdToPageCursor: Map<string, string | null> = new Map();

      // Do not loop infinitely, we need to stop at some point
      for (let i = MAX_ITERATIONS; i >= 0; i--) {
        if (i === 0) {
          throw new Error(
            `We looped more than ${MAX_ITERATIONS} times when fetching content-nodes for ${dataSourceViewsAndInternalIds.length} data source views and ${dataSourceViewsAndInternalIds.reduce((acc, curr) => acc + curr.internalIds.length, 0)} internal ids, something is wrong. Action: check the limit server-side (at time of writing, it was 1000)`
          );
        }
        const isFirstIteration = i === MAX_ITERATIONS;

        // Loop through the data source views and internal ids to fetch the content-nodes of the current page.
        const urlAndBodies: {
          url: string;
          body: { internalIds: string[]; viewType: ContentNodesViewType };
        }[] = [];
        for (const {
          dataSourceView,
          internalIds,
        } of dataSourceViewsAndInternalIds) {
          const pageCursor = dsvIdToPageCursor.get(dataSourceView.sId);
          // Either it's the first iteration or we have a page cursor, so we need to fetch the content-nodes of the current page.
          // When the page cursor is null, it means that we have fetched all the content-nodes for the current data source view.
          if (isFirstIteration || pageCursor) {
            // Note: for the cursor to be taken into account, we need to set a limit as well otherwise it will be ignored server-side.
            const params = new URLSearchParams();
            params.append("limit", NODES_PER_PAGE.toString());
            if (pageCursor) {
              params.append("cursor", pageCursor);
            }

            const url = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/content-nodes?${params}`;

            const body = {
              internalIds,
              viewType,
            };

            urlAndBodies.push({ url, body });
          }
        }

        if (urlAndBodies.length === 0) {
          // We have fetched all the content-nodes for all the data source views and internal ids, so we can break the loop.
          break;
        }
        try {
          // Clear all cursors
          dsvIdToPageCursor.clear();

          // Wait for all the fetches to be done.
          const r = await concurrentExecutor(
            urlAndBodies,
            async (urlAndBody) => {
              return fetcherWithBody([urlAndBody.url, urlAndBody.body, "POST"]);
            },
            {
              concurrency: 8,
            }
          );

          //  Append the nodes to the existing ones in the map.
          r.forEach(({ nodes, nextPageCursor }) => {
            if (nodes.length > 0) {
              const dsvId = nodes[0].dataSourceView.sId;
              dsvIdToNodes.set(dsvId, [
                ...(dsvIdToNodes.get(dsvId) ?? []),
                ...nodes,
              ]);
              dsvIdToPageCursor.set(dsvId, nextPageCursor);
            }
          });
        } catch (error) {
          setIsNodesError(true);
          break;
        }
      }

      // Once we are out of the loop, we can set the data source views and nodes.
      setDataSourceViewsAndNodes(
        dataSourceViewsAndInternalIds.map(({ dataSourceView }) => ({
          dataSourceView,
          nodes: dsvIdToNodes.get(dataSourceView.sId) ?? [],
        }))
      );
      setIsNodesLoading(false);
    };

    if (dataSourceViewsAndInternalIds.length > 0) {
      void fetchData();
    }
  }, [dataSourceViewsAndInternalIds, owner.sId, viewType]);

  return useMemo(
    () => ({
      dataSourceViewsAndNodes,
      isNodesLoading,
      isNodesError,
      invalidate: () => {
        setDataSourceViewsAndNodes(emptyArray());
        setIsNodesLoading(false);
        setIsNodesError(false);
      },
    }),
    [dataSourceViewsAndNodes, isNodesLoading, isNodesError]
  );
}

type FetchDataSourceViewContentNodesOptions = {
  owner: LightWorkspaceType;
  dataSourceView?: DataSourceViewType;
  internalIds?: string[];
  parentId?: string;
  pagination?: CursorPaginationParams;
  viewType?: ContentNodesViewType;
  sorting?: SortingParams;
  disabled?: boolean;
  swrOptions?: SWRConfiguration;
};

const makeURLDataSourceViewContentNodes = (
  {
    owner,
    dataSourceView,
  }: Required<
    Pick<FetchDataSourceViewContentNodesOptions, "owner" | "dataSourceView">
  >,
  searchParams: URLSearchParams
): string => {
  return `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/content-nodes?${searchParams}`;
};

export function useDataSourceViewContentNodes({
  owner,
  dataSourceView,
  internalIds,
  parentId,
  pagination,
  viewType,
  sorting,
  disabled = false,
  swrOptions,
}: FetchDataSourceViewContentNodesOptions): {
  isNodesError: boolean;
  isNodesLoading: boolean;
  isNodesValidating: boolean;
  mutate: KeyedMutator<GetDataSourceViewContentNodes>;
  mutateRegardlessOfQueryParams: KeyedMutator<GetDataSourceViewContentNodes>;
  nodes: GetDataSourceViewContentNodes["nodes"];
  totalNodesCount: number;
  totalNodesCountIsAccurate: boolean;
  nextPageCursor: string | null;
} {
  const params = new URLSearchParams();
  if (pagination?.cursor) {
    params.append("cursor", pagination.cursor);
  }
  if (pagination?.limit) {
    params.append("limit", pagination.limit.toString());
  }
  const url = dataSourceView
    ? makeURLDataSourceViewContentNodes({ owner, dataSourceView }, params)
    : null;

  const body = {
    internalIds,
    parentId,
    viewType,
    sorting,
  };

  const fetchKey = JSON.stringify([url, body]);

  const { data, error, mutate, isValidating, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      fetchKey,
      async () => {
        if (!url) {
          return undefined;
        }

        return fetcherWithBody([
          url,
          { internalIds, parentId, viewType, sorting },
          "POST",
        ]);
      },
      {
        ...swrOptions,
        disabled: disabled || !viewType || !dataSourceView?.spaceId,
      }
    );

  return {
    isNodesError: !!error,
    isNodesLoading:
      !error && !data && !disabled && !!viewType && !!dataSourceView?.spaceId,
    isNodesValidating: isValidating,
    mutate,
    mutateRegardlessOfQueryParams,
    nodes: data?.nodes ?? emptyArray(),
    totalNodesCount: data ? data.total : 0,
    totalNodesCountIsAccurate: data ? data.totalIsAccurate : true,
    nextPageCursor: data?.nextPageCursor || null,
  };
}

export function useInfiniteDataSourceViewContentNodes({
  owner,
  dataSourceView,
  pagination,
  internalIds,
  parentId,
  viewType,
  sorting,
  swrOptions,
}: FetchDataSourceViewContentNodesOptions) {
  const { data, error, isLoading, size, setSize, mutate, isValidating } =
    useSWRInfiniteWithDefaults<
      [string, GetContentNodesOrChildrenRequestBodyType] | null,
      GetDataSourceViewContentNodes
    >(
      (_pageIndex, previousPageData) => {
        // If we reached the end, stop fetching
        if (
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
          makeURLDataSourceViewContentNodes({ owner, dataSourceView }, params),
          body,
        ];
      },
      async ([url, body]) => {
        return fetcherWithBody([url, body, "POST"]);
      },
      swrOptions
    );

  const nodes = data?.flatMap((page) => page.nodes) ?? emptyArray();
  const lastPage = data?.[data.length - 1];
  const hasNextPage =
    lastPage?.nextPageCursor !== null && lastPage?.nextPageCursor !== undefined;

  const loadMore = useCallback(() => setSize((s) => s + 1), [setSize]);

  return {
    isNodesLoading: isLoading && !data,
    isNodesValidating: isValidating,
    nodesError: error,
    nodes,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    nextPageCursor: lastPage?.nextPageCursor || null,
    hasNextPage,
    loadMore,
    mutate,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    totalNodesCount: lastPage?.total || 0,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    totalNodesCountIsAccurate: lastPage?.totalIsAccurate || true,
    isLoadingMore:
      isLoading || (size > 0 && data && typeof data[size - 1] === "undefined"),
  };
}

export function useDataSourceViewConnectorConfiguration({
  dataSourceView,
  owner,
}: {
  dataSourceView: DataSourceViewType | null;
  owner: LightWorkspaceType;
}) {
  const dataSourceViewDocumentFetcher: Fetcher<GetDataSourceConfigurationResponseBody> =
    fetcher;
  const disabled = !dataSourceView;

  const { data, error, mutate } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/configuration`,
    dataSourceViewDocumentFetcher
  );

  return {
    configuration: data ? data.configuration : null,
    mutateConfiguration: mutate,
    isConfigurationLoading: !disabled && !error && !data,
    isConfigurationError: error,
  };
}

export function useDataSourceViewSearchTags({
  dataSourceViews,
  disabled = false,
  owner,
  query,
}: {
  dataSourceViews: DataSourceViewType[];
  disabled?: boolean;
  owner: LightWorkspaceType;
  query: string;
}) {
  const url =
    query.length >= MIN_SEARCH_QUERY_SIZE
      ? `/api/w/${owner.sId}/data_source_views/tags/search`
      : null;

  const body: PostTagSearchBody = {
    query,
    queryType: "match",
    dataSourceViewIds: dataSourceViews.map((dsv) => dsv.sId),
  };

  const fetchKey = JSON.stringify([url, body]);

  const { data, error, mutate, isValidating, isLoading } = useSWRWithDefaults(
    fetchKey,
    async () => {
      if (!url) {
        return null;
      }

      return fetcherWithBody([url, body, "POST"]);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      disabled,
    }
  );

  return {
    tags: data?.tags ?? emptyArray(),
    isLoading,
    isError: !!error,
    mutate,
    isValidating,
  };
}
