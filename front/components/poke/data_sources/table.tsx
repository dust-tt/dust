import type { DataSourceType, WorkspaceType } from "@dust-tt/types";

import { makeColumnsForDataSources } from "@app/components/poke/data_sources/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeDataSources } from "@app/poke/swr/data_sources";

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
}

export function DataSourceDataTable({ owner }: DataSourceDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Data Sources"
      owner={owner}
      useSWRHook={usePokeDataSources}
    >
      {(data, mutate) => (
        <PokeDataTable
          columns={makeColumnsForDataSources(owner, async () => {
            await mutate();
          })}
          data={prepareDataSourceForDisplay(data)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
