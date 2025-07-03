import { makeColumnsForGroups } from "@app/components/poke/groups/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeGroups } from "@app/poke/swr/groups";
import type { WorkspaceType } from "@app/types";

interface GroupDataTableProps {
  owner: WorkspaceType;
}

export function GroupDataTable({ owner }: GroupDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Groups"
      owner={owner}
      useSWRHook={usePokeGroups}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForGroups(owner)} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}