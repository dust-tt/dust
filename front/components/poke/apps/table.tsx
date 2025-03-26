import { makeColumnsForApps } from "@app/components/poke/apps/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeApps } from "@app/poke/swr/apps";
import type { LightWorkspaceType } from "@app/types";

interface AppDataTableProps {
  owner: LightWorkspaceType;
}

export function AppDataTable({ owner }: AppDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Apps"
      owner={owner}
      useSWRHook={usePokeApps}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForApps(owner)} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
