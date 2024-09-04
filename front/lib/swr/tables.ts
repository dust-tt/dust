import type { DataSourceViewType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { ListTablesResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/tables";
import type { GetTableResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/tables/[tId]";

export function useTables({
  workspaceId,
  dataSourceName,
}: {
  workspaceId: string;
  dataSourceName: string;
}) {
  const tablesFetcher: Fetcher<ListTablesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    dataSourceName
      ? `/api/w/${workspaceId}/data_sources/${dataSourceName}/tables`
      : null,
    tablesFetcher
  );

  return {
    tables: useMemo(() => (data ? data.tables : []), [data]),
    isTablesLoading: !error && !data,
    isTablesError: error,
    mutateTables: mutate,
  };
}

export function useTable({
  workspaceId,
  dataSourceView,
  tableId,
}: {
  workspaceId: string;
  dataSourceView: DataSourceViewType;
  tableId: string | null;
}) {
  const tableFetcher: Fetcher<GetTableResponseBody> = fetcher;

  const endpoint = `/api/w/${workspaceId}/vaults/${dataSourceView.vaultId}/data_source_views/${dataSourceView.sId}/tables/${tableId}`;
  const { data, error, mutate } = useSWRWithDefaults(
    tableId ? endpoint : null,
    tableFetcher
  );
  return {
    table: data ? data.table : null,
    isTableLoading: tableId && !error && !data,
    isTableError: error,
    mutateTable: mutate,
  };
}
