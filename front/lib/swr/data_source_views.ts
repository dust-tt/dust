import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import type { PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Fetcher, KeyedMutator, SWRConfiguration } from "swr";

import {
  appendPaginationParams,
  fetcher,
  fetcherMultiple,
  postFetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetDataSourceViewsResponseBody } from "@app/pages/api/w/[wId]/data_source_views";
import type { GetDataSourceViewContentNodes } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views/[dsvId]/content-nodes";
import type { GetDataSourceViewDocumentResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views/[dsvId]/documents/[documentId]";
import type { ListTablesResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views/[dsvId]/tables";
import type { GetDataSourceConfigurationResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources/[dsId]/configuration";

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
    dataSourceViews: useMemo(() => (data ? data.dataSourceViews : []), [data]),
    isDataSourceViewsLoading: disabled ? false : !error && !data,
    isDataSourceViewsError: disabled ? false : error,
    mutateDataSourceViews: mutate,
  };
}

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
} {
  const urlsAndOptions = dataSourceViewsAndInternalIds.map(
    ({ dataSourceView, internalIds }) => {
      const url = `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_source_views/${dataSourceView.sId}/content-nodes`;
      const body = JSON.stringify({
        internalIds,
        viewType,
      });
      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      };
      return { url, options };
    }
  );

  const { data: results, error } = useSWRWithDefaults(
    urlsAndOptions,
    fetcherMultiple<GetDataSourceViewContentNodes>
  );
  const isNodesError = !!error;
  const isNodesLoading = !results?.every((r) => r.nodes);

  return useMemo(
    () => ({
      dataSourceViewsAndNodes: dataSourceViewsAndInternalIds.map(
        ({ dataSourceView }, i) => ({
          dataSourceView,
          nodes: results ? results[i].nodes : [],
        })
      ),
      isNodesError,
      isNodesLoading,
    }),
    [dataSourceViewsAndInternalIds, isNodesError, isNodesLoading, results]
  );
}

export function useDataSourceViewContentNodes({
  owner,
  dataSourceView,
  internalIds,
  parentId,
  pagination,
  viewType,
  disabled = false,
  swrOptions,
}: {
  owner: LightWorkspaceType;
  dataSourceView?: DataSourceViewType;
  internalIds?: string[];
  parentId?: string;
  pagination?: PaginationState;
  viewType?: ContentNodesViewType;
  disabled?: boolean;
  swrOptions?: SWRConfiguration;
}): {
  isNodesError: boolean;
  isNodesLoading: boolean;
  isNodesValidating: boolean;
  mutate: KeyedMutator<GetDataSourceViewContentNodes>;
  mutateRegardlessOfQueryParams: KeyedMutator<GetDataSourceViewContentNodes>;
  nodes: GetDataSourceViewContentNodes["nodes"];
  totalNodesCount: number;
} {
  const params = new URLSearchParams();
  appendPaginationParams(params, pagination);

  const url = dataSourceView
    ? `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_source_views/${dataSourceView.sId}/content-nodes?${params}`
    : null;

  const body = {
    internalIds,
    parentId,
    viewType,
  };

  const fetchKey = JSON.stringify([url + "?" + params.toString(), body]);

  const { data, error, mutate, isValidating, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      fetchKey,
      async () => {
        if (!url) {
          return undefined;
        }

        return postFetcher([url, { internalIds, parentId, viewType }]);
      },
      {
        ...swrOptions,
        disabled: disabled || !viewType,
      }
    );

  return {
    isNodesError: !!error,
    isNodesLoading: !error && !data,
    isNodesValidating: isValidating,
    mutate,
    mutateRegardlessOfQueryParams,
    nodes: useMemo(() => (data ? data.nodes : []), [data]),
    totalNodesCount: data ? data.total : 0,
  };
}

export function useDataSourceViewDocument({
  dataSourceView,
  documentId,
  owner,
}: {
  dataSourceView: DataSourceViewType | null;
  documentId: string | null;
  owner: LightWorkspaceType;
}) {
  const dataSourceViewDocumentFetcher: Fetcher<GetDataSourceViewDocumentResponseBody> =
    fetcher;
  const disabled = !dataSourceView || !documentId;

  const { data, error, mutate } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_source_views/${dataSourceView.sId}/documents/${encodeURIComponent(documentId)}`,
    dataSourceViewDocumentFetcher
  );

  return {
    document: data?.document,
    isDocumentLoading: !disabled && !error && !data,
    isDocumentError: error,
    mutateDocument: mutate,
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

  const { data, error } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_sources/${dataSourceView.dataSource.sId}/configuration`,
    dataSourceViewDocumentFetcher
  );

  return {
    configuration: data ? data.configuration : null,
    isDocumentLoading: !disabled && !error && !data,
    isDocumentError: error,
  };
}

export function useDataSourceViewTables({
  dataSourceView,
  workspaceId,
}: {
  dataSourceView: DataSourceViewType | null;
  workspaceId: string;
}) {
  const tablesFetcher: Fetcher<ListTablesResponseBody> = fetcher;
  const disabled = !dataSourceView;

  const { data, error, mutate } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/w/${workspaceId}/vaults/${dataSourceView.vaultId}/data_source_views/${dataSourceView.sId}/tables`,
    tablesFetcher
  );

  return {
    tables: useMemo(() => (data ? data.tables : []), [data]),
    isTablesLoading: !disabled && !error && !data,
    isTablesError: error,
    mutateTables: mutate,
  };
}
