import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetTableResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/tables/[tId]";

export function useTable({
  owner,
  dataSourceView,
  tableId,
  disabled,
}: {
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  tableId: string | null;
  disabled?: boolean;
}) {
  const tableFetcher: Fetcher<GetTableResponseBody> = fetcher;

  const endpoint = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/tables/${tableId}`;
  const { data, error, mutate } = useSWRWithDefaults(
    tableId ? endpoint : null,
    tableFetcher,
    {
      disabled,
    }
  );
  return {
    table: data ? data.table : null,
    isTableLoading: !!tableId && !error && !data,
    isTableError: error,
    mutateTable: mutate,
  };
}
