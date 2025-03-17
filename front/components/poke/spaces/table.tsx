import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSpaces } from "@app/components/poke/spaces/columns";
import { usePokeSpaces } from "@app/poke/swr/spaces";
import type { WorkspaceType } from "@app/types";

interface SpaceDataTableProps {
  owner: WorkspaceType;
}

export function SpaceDataTable({ owner }: SpaceDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Spaces"
      owner={owner}
      useSWRHook={usePokeSpaces}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForSpaces(owner)} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
