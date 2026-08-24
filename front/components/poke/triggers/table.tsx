import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForTriggers } from "@app/components/poke/triggers/columns";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type { TriggerWithProviderType } from "@app/lib/api/poke/triggers";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import {
  usePokeTriggerConsumption,
  usePokeTriggers,
} from "@app/poke/swr/triggers";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import { WEBHOOK_PROVIDERS } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

const TRIGGER_PROVIDER_FACETS = [
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
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const { data: agentConfigurations } = usePokeAgentConfigurations({
    owner,
    disabled: false,
  });

  return (
    <PokeDataTableConditionalFetch
      header="Triggers"
      owner={owner}
      globalActions={
        agentId === undefined ? (
          <ConsumptionPeriodSelector
            period={period}
            onPeriodChange={setPeriod}
          />
        ) : undefined
      }
      loadOnInit={loadOnInit}
      useSWRHook={usePokeTriggers}
    >
      {(triggers, mutateTriggers) => {
        const filteredTriggers = agentId
          ? triggers.filter(
              (trigger) => trigger.agentConfigurationId === agentId
            )
          : triggers;
        const onTriggerDeleted = async () => {
          await mutateTriggers();
        };

        if (agentId === undefined) {
          return (
            <TriggerConsumptionTable
              agentConfigurations={agentConfigurations}
              onTriggerDeleted={onTriggerDeleted}
              owner={owner}
              period={period}
              triggers={filteredTriggers}
            />
          );
        }

        return (
          <PokeDataTable
            columns={makeColumnsForTriggers(
              owner,
              agentConfigurations,
              onTriggerDeleted
            )}
            data={filteredTriggers}
            facets={TRIGGER_PROVIDER_FACETS}
          />
        );
      }}
    </PokeDataTableConditionalFetch>
  );
}

interface TriggerConsumptionTableProps {
  agentConfigurations: LightAgentConfigurationType[];
  onTriggerDeleted: () => Promise<void>;
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  triggers: TriggerWithProviderType[];
}

function TriggerConsumptionTable({
  agentConfigurations,
  onTriggerDeleted,
  owner,
  period,
  triggers,
}: TriggerConsumptionTableProps) {
  const triggerIds = triggers.map((trigger) => trigger.sId);
  const { statsByTriggerId, isConsumptionLoading, isConsumptionError } =
    usePokeTriggerConsumption({ owner, period, triggerIds });
  const displayTriggers = triggers.map((trigger) => ({
    ...trigger,
    consumption: statsByTriggerId[trigger.sId],
  }));

  return (
    <PokeDataTable
      columns={makeColumnsForTriggers(
        owner,
        agentConfigurations,
        onTriggerDeleted,
        {
          isError: Boolean(isConsumptionError),
          isLoading: isConsumptionLoading,
        }
      )}
      data={displayTriggers}
      facets={TRIGGER_PROVIDER_FACETS}
    />
  );
}
