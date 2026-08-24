import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import {
  makeColumnsForAutomationTriggers,
  makeColumnsForTriggers,
} from "@app/components/poke/triggers/columns";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { usePokeTriggers } from "@app/poke/swr/triggers";
import type { TriggerKind } from "@app/types/assistant/triggers";
import { isValidTriggerKind } from "@app/types/assistant/triggers";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import { WEBHOOK_PROVIDERS } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Spinner } from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useState } from "react";

const TRIGGER_PAGE_SIZE = 25;

const TRIGGER_KIND_OPTIONS = (["schedule", "webhook"] as const).map((kind) => ({
  label: asDisplayName(kind),
  value: kind,
}));

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
}

export function TriggerDataTable({ owner, agentId }: TriggerDataTableProps) {
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: TRIGGER_PAGE_SIZE,
  });
  const [search, setSearch] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<TriggerKind[]>([]);
  const [loadedAgentId, setLoadedAgentId] = useState<string | null>(null);
  const shouldLoadAgentTriggers =
    agentId !== undefined && loadedAgentId === agentId;

  const handlePeriodChange = (nextPeriod: ConsumptionPeriodSelection) => {
    setPeriod(nextPeriod);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const handleSearchChange = (nextSearch: string) => {
    setSearch(nextSearch);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const handleKindChange = (values: string[]) => {
    setSelectedKinds(values.filter(isValidTriggerKind));
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const triggerData = usePokeTriggers(
    agentId !== undefined
      ? {
          scope: "agent",
          owner,
          agentId,
          disabled: !shouldLoadAgentTriggers,
        }
      : {
          scope: "workspace",
          owner,
          period,
          limit: pagination.pageSize,
          offset: pagination.pageIndex * pagination.pageSize,
          search: search || undefined,
          filter:
            selectedKinds.length > 0 ? { kinds: selectedKinds } : undefined,
        }
  );

  const onTriggerDeleted = async () => {
    if (
      triggerData.scope === "workspace" &&
      triggerData.triggers.length === 1 &&
      pagination.pageIndex > 0
    ) {
      setPagination((current) => ({
        ...current,
        pageIndex: Math.max(0, current.pageIndex - 1),
      }));
      return;
    }
    await triggerData.mutateTriggers();
  };

  let content: ReactNode;

  if (triggerData.scope === "agent" && !shouldLoadAgentTriggers) {
    content = (
      <div className="flex justify-center">
        <Button
          label="Load Data"
          variant="outline"
          onClick={() => setLoadedAgentId(triggerData.agentId)}
        />
      </div>
    );
  } else if (triggerData.isTriggersError) {
    content = (
      <div className="flex h-32 items-center justify-center">
        <p>Error loading data.</p>
      </div>
    );
  } else if (triggerData.scope === "agent") {
    content = triggerData.isTriggersLoading ? (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    ) : (
      <PokeDataTable
        columns={makeColumnsForTriggers(owner, onTriggerDeleted)}
        data={triggerData.triggers}
        facets={TRIGGER_PROVIDER_FACETS}
      />
    );
  } else {
    content = (
      <PokeDataTable
        columns={makeColumnsForAutomationTriggers(owner, onTriggerDeleted)}
        data={triggerData.triggers}
        getRowId={(trigger) => trigger.triggerId}
        isLoading={triggerData.isTriggersLoading}
        isValidating={triggerData.isTriggersValidating}
        serverSideRowCount={triggerData.totalCount}
        sortCurrentPage
        pagination={pagination}
        onPaginationChange={setPagination}
        search={search}
        onSearchChange={handleSearchChange}
        facets={[
          {
            columnId: "kind",
            title: "Kind",
            options: TRIGGER_KIND_OPTIONS,
            selectedValues: selectedKinds,
            onSelectedValuesChange: handleKindChange,
          },
        ]}
      />
    );
  }

  return (
    <div className="my-4 flex min-h-24 flex-col rounded-lg border bg-background">
      <div className="flex justify-between gap-3 rounded-t-lg border-b border-separator bg-background p-4">
        <h2 className="text-md font-bold">Triggers</h2>
        {triggerData.scope === "workspace" && (
          <ConsumptionPeriodSelector
            period={period}
            onPeriodChange={handlePeriodChange}
          />
        )}
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        {content}
      </div>
    </div>
  );
}
