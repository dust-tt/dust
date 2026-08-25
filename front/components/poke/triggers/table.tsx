import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForAutomationTriggers } from "@app/components/poke/triggers/columns";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { usePokeTriggers } from "@app/poke/swr/triggers";
import type { TriggerKind } from "@app/types/assistant/triggers";
import {
  isValidTriggerKind,
  TRIGGER_KINDS,
} from "@app/types/assistant/triggers";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { PaginationState } from "@tanstack/react-table";
import { useState } from "react";

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

  const {
    triggers,
    totalCount,
    isTriggersLoading,
    isTriggersValidating,
    isTriggersError,
    mutateTriggers,
  } = usePokeTriggers({
    owner,
    period,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
    search: search || undefined,
    filter: selectedKinds.length > 0 ? { kinds: selectedKinds } : undefined,
  });

  const onTriggerDeleted = async () => {
    if (triggers.length === 1 && pagination.pageIndex > 0) {
      setPagination((current) => ({
        ...current,
        pageIndex: Math.max(0, current.pageIndex - 1),
      }));
      return;
    }
    await mutateTriggers();
  };

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
            columns={makeColumnsForAutomationTriggers(owner, onTriggerDeleted)}
            data={triggers}
            getRowId={(trigger) => trigger.triggerId}
            isLoading={isTriggersLoading}
            isValidating={isTriggersValidating}
            serverSideRowCount={totalCount}
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
        )}
      </div>
    </div>
  );
}
