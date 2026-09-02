import { makeColumnsForFrames } from "@app/components/poke/frames/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFrames } from "@app/poke/swr/frames";
import type { LightWorkspaceType } from "@app/types/user";

interface FramesDataTableProps {
  owner: LightWorkspaceType;
}

export function FramesDataTable({ owner }: FramesDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Frames"
      loadOnInit
      owner={owner}
      useSWRHook={usePokeFrames}
    >
      {(items) => (
        <PokeDataTable columns={makeColumnsForFrames({ owner })} data={items} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
