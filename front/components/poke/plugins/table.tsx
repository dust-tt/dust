import { makeColumnsForPluginRuns } from "@app/components/poke/plugins/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokePluginRuns } from "@app/poke/swr/plugins";
import type { LightWorkspaceType } from "@app/types";

interface PluginRunsDataTableProps {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}

export function PluginRunsDataTable({
  owner,
  loadOnInit,
}: PluginRunsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Plugin audit logs"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokePluginRuns}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForPluginRuns()} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
