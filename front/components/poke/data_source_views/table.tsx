import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";

import { makeColumnsForDataSourceViews } from "@app/components/poke/data_source_views/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { usePokeDataSourceViews } from "@app/poke/swr/data_source_views";

interface DataSourceViewsDataTableProps {
  owner: LightWorkspaceType;
}

function prepareDataSourceViewsForDisplay(
  owner: LightWorkspaceType,
  dataSourceViews: DataSourceViewType[]
) {
  return dataSourceViews.map((dsv) => {
    return {
      ...dsv,
      dataSourceLink: `/poke/${owner.sId}/data_sources/${dsv.dataSource.sId}`,
      dataSourceName: getDisplayNameForDataSource(dsv.dataSource),
      dataSourceViewLink: `/poke/${owner.sId}/vaults/${dsv.vaultId}/data_source_views/${dsv.sId}`,
      editedAt: dsv.editedByUser?.editedAt ?? undefined,
      editedBy: dsv.editedByUser?.fullName ?? undefined,
      name: dsv.sId,
    };
  });
}

export function DataSourceViewsDataTable({
  owner,
}: DataSourceViewsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Data Source Views"
      owner={owner}
      useSWRHook={usePokeDataSourceViews}
    >
      {(data) => (
        <PokeDataTable
          columns={makeColumnsForDataSourceViews()}
          data={prepareDataSourceViewsForDisplay(owner, data)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
