import { makeColumnsForDataSources } from "@app/components/poke/data_sources/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeDataSources } from "@app/poke/swr/data_sources";
import type { DataSourceType, WorkspaceType } from "@app/types";

function prepareDataSourceForDisplay(dataSources: DataSourceType[]) {
  return dataSources.map((ds) => {
    return {
      ...ds,
      editedAt: ds.editedByUser?.editedAt ?? undefined,
      editedBy: ds.editedByUser?.fullName ?? undefined,
    };
  });
}

interface DataSourceDataTableProps {
  owner: WorkspaceType;
  loadOnInit?: boolean;
}

export function DataSourceDataTable({
  owner,
  loadOnInit,
}: DataSourceDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Data Sources"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeDataSources}
    >
      {(data) => (
        <PokeDataTable
          columns={makeColumnsForDataSources(owner)}
          data={prepareDataSourceForDisplay(data)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
