import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForTriggers } from "@app/components/poke/triggers/columns";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { usePokeTriggers } from "@app/poke/swr/triggers";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";
import { WEBHOOK_PROVIDERS } from "@app/types/triggers/webhooks";

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

        // Create facet options for provider filter
        const providerFacets = [
          {
            columnId: "provider",
            title: "Provider",
            options: [
              ...WEBHOOK_PROVIDERS.map((provider) => ({
                label: asDisplayName(provider),
                value: provider,
              })),
              { label: "Custom", value: "Custom" },
            ],
          },
        ];

        return (
          <PokeDataTable
            columns={columns}
            data={filteredTriggers}
            facets={providerFacets}
          />
        );
      }}
    </PokeDataTableConditionalFetch>
  );
}
