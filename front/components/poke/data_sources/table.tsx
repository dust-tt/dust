import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";

import { makeColumnsForDataSources } from "@app/components/poke/data_sources/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";

interface DataSourceDataTableProps {
  owner: WorkspaceType;
  dataSources: DataSourceType[];
}

function prepareDataSourceForDisplay(dataSources: DataSourceType[]) {
  return dataSources.map((ds) => {
    return {
      ...ds,
      editedAt: ds.editedByUser?.editedAt ?? undefined,
      editedBy: ds.editedByUser?.fullName ?? undefined,
    };
  });
}

export function DataSourceDataTable({
  owner,
  dataSources,
}: DataSourceDataTableProps) {
  const router = useRouter();

  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">Data Sources:</h2>
      <PokeDataTable
        columns={makeColumnsForDataSources(owner, router.reload)}
        data={prepareDataSourceForDisplay(dataSources)}
      />
    </div>
  );
}
