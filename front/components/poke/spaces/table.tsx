import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSpaces } from "@app/components/poke/spaces/columns";
import { usePokeSpaces } from "@app/poke/swr/spaces";
import type { WorkspaceType } from "@app/types";

interface SpaceDataTableProps {
  owner: WorkspaceType;
  loadOnInit?: boolean;
}

export function SpaceDataTable({ owner, loadOnInit }: SpaceDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Spaces"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeSpaces}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForSpaces(owner)} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
