import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForTriggers } from "@app/components/poke/triggers/columns";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { usePokeTriggers } from "@app/poke/swr/triggers";
import type { LightWorkspaceType } from "@app/types";

interface TriggerDataTableProps {
  owner: LightWorkspaceType;
}

export function TriggerDataTable({ owner }: TriggerDataTableProps) {
  const { data: agentConfigurations } = usePokeAgentConfigurations({
    owner,
    disabled: false,
  });

  return (
    <PokeDataTableConditionalFetch
      header="Triggers"
      owner={owner}
      useSWRHook={usePokeTriggers}
    >
      {(triggers, mutateTriggers) => {
        const columns = makeColumnsForTriggers(
          owner,
          agentConfigurations,
          async () => {
            await mutateTriggers();
          }
        );

        return <PokeDataTable columns={columns} data={triggers} />;
      }}
    </PokeDataTableConditionalFetch>
  );
}
