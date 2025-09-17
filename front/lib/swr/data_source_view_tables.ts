import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { ListTablesResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables";
import type { GetDataSourceViewTableResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables/[tableId]";
import type { SearchTablesResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables/search";
import type { PatchTableResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/[tableId]";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PatchDataSourceTableRequestBody,
} from "@app/types";

export function useDataSourceViewTable({
  dataSourceView,
  tableId,
  owner,
  disabled,
}: {
  dataSourceView: DataSourceViewType | null;
  tableId: string | null;
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const dataSourceViewTableFetcher: Fetcher<GetDataSourceViewTableResponseBody> =
    fetcher;
  const url =
    dataSourceView && tableId
      ? `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/tables/${encodeURIComponent(tableId)}`
      : null;

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    dataSourceViewTableFetcher,
    {
      disabled,
    }
  );

  return {
    table: data?.table,
    isTableLoading: !disabled && !error && !data,
    isTableError: error,
    mutateTable: mutate,
  };
}

export function useDataSourceViewTables({
  dataSourceView,
  owner,
  pagination,
  searchQuery,
  disabled,
}: {
  dataSourceView: DataSourceViewType | null;
  owner: LightWorkspaceType;
  pagination?: { cursor: string | null; limit: number };
  searchQuery?: string;
  disabled?: boolean;
}) {
  const isDisabled = !dataSourceView || disabled;
  const params = new URLSearchParams();

  if (pagination?.cursor) {
    params.set("cursor", pagination.cursor);
  }
  if (pagination?.limit) {
    params.set("limit", pagination.limit.toString());
  }
  if (searchQuery) {
    params.set("query", searchQuery);
  }

  const baseUrl = dataSourceView
    ? `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/tables`
    : null;

  const url =
    baseUrl && `${baseUrl}${searchQuery ? "/search" : ""}?${params.toString()}`;

  const tablesFetcher: Fetcher<
    ListTablesResponseBody | SearchTablesResponseBody
  > = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    isDisabled ? null : url,
    tablesFetcher,
    { disabled: isDisabled }
  );

  return {
    tables: data?.tables ?? emptyArray(),
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    nextPageCursor: data?.nextPageCursor || null,
    isTablesLoading: !isDisabled && !error && !data,
    isTablesError: error,
    mutateTables: mutate,
  };
}

export function useUpdateDataSourceViewTable(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  tableId: string
) {
  const { mutateRegardlessOfQueryParams: mutateContentNodes } =
    useDataSourceViewContentNodes({
      owner,
      dataSourceView,
      disabled: true, // Needed just to mutate
    });

  const { mutateTable } = useDataSourceViewTable({
    owner,
    dataSourceView,
    tableId,
    disabled: true, // Needed just to mutate
  });

  const sendNotification = useSendNotification();

  const doUpdate = async (body: PatchDataSourceTableRequestBody) => {
    const tableUrl = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/tables/${encodeURIComponent(tableId)}`;
    const res = await fetch(tableUrl, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error creating table",
        description: `Error: ${errorData.message}`,
      });
      console.error("Error updating table", errorData);
      return null;
    } else {
      void mutateContentNodes();
      void mutateTable();

      sendNotification({
        type: "success",
        title: "Table updated",
        description: "Table has been updated",
      });

      const response: PatchTableResponseBody = await res.json();
      return response.table;
    }
  };

  return doUpdate;
}
