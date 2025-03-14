import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForTrackers } from "@app/components/poke/trackers/columns";
import { usePokeTrackers } from "@app/poke/swr/trackers";
import type { WorkspaceType } from "@app/types";

interface TrackerDataTableProps {
  owner: WorkspaceType;
}

export function TrackerDataTable({ owner }: TrackerDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Trackers"
      owner={owner}
      useSWRHook={usePokeTrackers}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForTrackers(owner)} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
