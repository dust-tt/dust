import { ConfirmContext } from "@app/components/Confirm";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeTriggerTableRow } from "@app/components/poke/triggers/columns";
import { makeColumnsForAutomationTriggers } from "@app/components/poke/triggers/columns";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { usePokeTriggers } from "@app/poke/swr/triggers";
import type { TriggerKind, TriggerStatus } from "@app/types/assistant/triggers";
import {
  getTriggerStatusOwner,
  isValidTriggerKind,
  TRIGGER_KINDS,
} from "@app/types/assistant/triggers";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useContext, useState } from "react";

const TRIGGER_PAGE_SIZE = 25;

const TRIGGER_KIND_OPTIONS = TRIGGER_KINDS.map((kind) => ({
  label: asDisplayName(kind),
  value: kind,
}));

interface TriggerDataTableProps {
  owner: LightWorkspaceType;
}

export function TriggerDataTable({ owner }: TriggerDataTableProps) {
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: TRIGGER_PAGE_SIZE,
  });
  const [search, setSearch] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<TriggerKind[]>([]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "credits", desc: true },
  ]);
  const [pendingTriggerIds, setPendingTriggerIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, TriggerStatus>
  >({});

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

  const handleSortingChange = (nextSorting: SortingState) => {
    setSorting(nextSorting);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const {
    triggers,
    totalCount,
    isTriggersLoading,
    isTriggersValidating,
    isTriggersError,
    updateTriggerStatus,
  } = usePokeTriggers({
    owner,
    period,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
    search: search || undefined,
    filter: selectedKinds.length > 0 ? { kinds: selectedKinds } : undefined,
    sortOrder: sorting[0]?.desc === false ? "asc" : "desc",
  });

  // The table data comes from an expensive Elasticsearch query, so instead of
  // revalidating after a toggle we track the new statuses locally. Refetched
  // rows already carry any status we wrote, so reset overrides during render.
  const [previousTriggers, setPreviousTriggers] = useState(triggers);
  if (previousTriggers !== triggers) {
    setPreviousTriggers(triggers);
    setStatusOverrides({});
  }

  const confirm = useContext(ConfirmContext);

  const handleToggleStatus = async (
    trigger: AutomationTriggerRow,
    currentStatus: TriggerStatus
  ) => {
    if (getTriggerStatusOwner(currentStatus) === "system") {
      return;
    }

    const nextStatus = currentStatus === "enabled" ? "disabled" : "enabled";
    if (nextStatus === "disabled") {
      const confirmed = await confirm({
        title: "Disable this automation?",
        message: `"${trigger.name}" will stop running for ${trigger.editor.name}. A manager or admin will be able to re-enable it.`,
        validateVariant: "warning",
        validateLabel: "Disable",
        cancelLabel: "Cancel",
      });
      if (!confirmed) {
        return;
      }
    }

    setPendingTriggerIds((ids) => new Set([...ids, trigger.triggerId]));
    try {
      const success = await updateTriggerStatus({
        triggerId: trigger.triggerId,
        status: nextStatus,
      });
      if (success) {
        setStatusOverrides((overrides) => ({
          ...overrides,
          [trigger.triggerId]:
            nextStatus === "disabled" ? "disabled_by_manager" : "enabled",
        }));
      }
    } finally {
      setPendingTriggerIds((ids) => {
        const nextIds = new Set(ids);
        nextIds.delete(trigger.triggerId);
        return nextIds;
      });
    }
  };

  const rows: PokeTriggerTableRow[] = triggers.map((trigger) => {
    const displayStatus = statusOverrides[trigger.triggerId] ?? trigger.status;
    return {
      ...trigger,
      displayStatus,
      isStatusPending: pendingTriggerIds.has(trigger.triggerId),
      onToggleStatus: () => void handleToggleStatus(trigger, displayStatus),
    };
  });

  return (
    <div className="my-4 flex min-h-24 flex-col rounded-lg border bg-background">
      <div className="flex justify-between gap-3 rounded-t-lg border-b border-separator bg-background p-4">
        <h2 className="text-md font-bold">Triggers</h2>
        <ConsumptionPeriodSelector
          period={period}
          onPeriodChange={handlePeriodChange}
        />
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        {isTriggersError ? (
          <div className="flex h-32 items-center justify-center">
            <p>Error loading data.</p>
          </div>
        ) : (
          <PokeDataTable
            columns={makeColumnsForAutomationTriggers(owner)}
            data={rows}
            getRowId={(trigger) => trigger.triggerId}
            isLoading={isTriggersLoading}
            isValidating={isTriggersValidating}
            serverSideRowCount={totalCount}
            pagination={pagination}
            onPaginationChange={setPagination}
            sorting={sorting}
            onSortingChange={handleSortingChange}
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
        )}
      </div>
    </div>
  );
}
