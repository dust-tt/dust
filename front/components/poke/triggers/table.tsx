import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForTriggers } from "@app/components/poke/triggers/columns";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { usePokeTriggers } from "@app/poke/swr/triggers";
import type { LightWorkspaceType } from "@app/types";

interface TriggerDataTableProps {
  owner: LightWorkspaceType;
  agentId?: string;
  loadOnInit?: boolean;
}

export function TriggerDataTable({
  owner,
  agentId,
  loadOnInit,
}: TriggerDataTableProps) {
  const { data: agentConfigurations } = usePokeAgentConfigurations({
    owner,
    disabled: false,
  });

  return (
    <PokeDataTableConditionalFetch
      header="Triggers"
      owner={owner}
      loadOnInit={loadOnInit}
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

        // Filter triggers by agent ID if provided
        const filteredTriggers = agentId
          ? triggers.filter(
              (trigger) => trigger.agentConfigurationId === agentId
            )
          : triggers;

        return <PokeDataTable columns={columns} data={filteredTriggers} />;
      }}
    </PokeDataTableConditionalFetch>
  );
}
