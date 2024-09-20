import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";

import { makeColumnsForDataSourceViews } from "@app/components/poke/data_source_views/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { getDataSourceName } from "@app/lib/data_sources";
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
      name: dsv.sId,
      dataSourceName: getDataSourceName(dsv.dataSource),
      editedAt: dsv.editedByUser?.editedAt ?? undefined,
      editedBy: dsv.editedByUser?.fullName ?? undefined,
      dataSourceLink: `/poke/${owner.sId}/data_sources/${dsv.dataSource.sId}`,
      dataSourceViewLink: `/poke/${owner.sId}/vaults/${dsv.vaultId}/data_source_views/${dsv.sId}`,
    };
  });
}

export function DataSourceViewsDataTable({
  owner,
}: DataSourceViewsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Data source views"
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
