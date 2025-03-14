import { makeColumnsForDataSourceViews } from "@app/components/poke/data_source_views/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { usePokeDataSourceViews } from "@app/poke/swr/data_source_views";
import type { DataSourceViewType, LightWorkspaceType } from "@app/types";

interface DataSourceViewsDataTableProps {
  owner: LightWorkspaceType;
  spaceId?: string;
}

function prepareDataSourceViewsForDisplay(
  owner: LightWorkspaceType,
  dataSourceViews: DataSourceViewType[],
  spaceId?: string
) {
  return dataSourceViews
    .map((dsv) => {
      return {
        ...dsv,
        dataSourceLink: `/poke/${owner.sId}/data_sources/${dsv.dataSource.sId}`,
        dataSourceName: getDisplayNameForDataSource(dsv.dataSource),
        dataSourceViewLink: `/poke/${owner.sId}/spaces/${dsv.spaceId}/data_source_views/${dsv.sId}`,
        editedAt: dsv.editedByUser?.editedAt ?? undefined,
        editedBy: dsv.editedByUser?.fullName ?? undefined,
        name: dsv.sId,
      };
    })
    .filter((dsv) => !spaceId || dsv.spaceId === spaceId);
}

export function DataSourceViewsDataTable({
  owner,
  spaceId,
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
          data={prepareDataSourceViewsForDisplay(owner, data, spaceId)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
