import { makeColumnsForPluginRuns } from "@app/components/poke/plugins/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokePluginRuns } from "@app/poke/swr/plugins";
import type { LightWorkspaceType, PluginRunType } from "@app/types";

interface PluginRunsDataTableProps {
  owner: LightWorkspaceType;
}

function preparePluginRunsForDisplay(
  owner: LightWorkspaceType,
  pluginRuns: PluginRunType[]
) {
  return pluginRuns.map((run) => {
    // We need to add display properties but keep the original properties
    const result = {
      ...run,
    };

    return result;
  });
}

export function PluginRunsDataTable({ owner }: PluginRunsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Plugin audit logs"
      owner={owner}
      useSWRHook={usePokePluginRuns}
    >
      {(data) => (
        <PokeDataTable
          columns={makeColumnsForPluginRuns()}
          data={preparePluginRunsForDisplay(owner, data)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
