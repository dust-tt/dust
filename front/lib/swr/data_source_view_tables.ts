import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { ListTablesResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables";
import type { GetDataSourceViewTableResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables/[tableId]";
import type { PatchTableResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/[tableId]";
import type { DataSourceViewType, LightWorkspaceType } from "@app/types";
import type { PatchDataSourceTableRequestBody } from "@app/types";

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
}: {
  dataSourceView: DataSourceViewType | null;
  owner: LightWorkspaceType;
}) {
  const tablesFetcher: Fetcher<ListTablesResponseBody> = fetcher;
  const disabled = !dataSourceView;

  const url = dataSourceView
    ? `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/tables`
    : null;
  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : url,
    tablesFetcher
  );

  return {
    tables: useMemo(() => (data ? data.tables : []), [data]),
    isTablesLoading: !disabled && !error && !data,
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
