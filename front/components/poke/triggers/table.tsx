import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForTriggers } from "@app/components/poke/triggers/columns";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import { useDebounce } from "@app/hooks/useDebounce";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type {
  PokeTriggerOrderColumn,
  PokeTriggerProviderFilter,
} from "@app/lib/api/poke/triggers";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import {
  clearPokeTriggerCaches,
  usePokeTriggerSearch,
  usePokeTriggers,
} from "@app/poke/swr/triggers";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import {
  isWebhookProvider,
  WEBHOOK_PROVIDERS,
} from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useEffect, useState } from "react";

const TRIGGER_PAGE_SIZE = 25;

const TRIGGER_PROVIDER_FACETS = [
  {
    columnId: "provider",
    title: "Provider",
    options: [
      ...WEBHOOK_PROVIDERS.map((provider) => ({
        label: asDisplayName(provider),
        value: provider,
      })),
      { label: "Custom", value: "custom" },
    ],
  },
];

function isTriggerProviderFilter(
  value: string
): value is PokeTriggerProviderFilter {
  return value === "custom" || isWebhookProvider(value);
}

function toTriggerOrderColumn(columnId: string | undefined) {
  switch (columnId) {
    case "sId":
    case "name":
    case "agentName":
    case "kind":
    case "origin":
    case "provider":
    case "consumption":
    case "status":
    case "editorEmail":
    case "createdAt":
      return columnId satisfies PokeTriggerOrderColumn;
    default:
      return "createdAt" satisfies PokeTriggerOrderColumn;
  }
}

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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [providers, setProviders] = useState<PokeTriggerProviderFilter[]>([]);
  const { inputValue, debouncedValue, isDebouncing, setValue } = useDebounce(
    "",
    { delay: 300 }
  );

  const resetPage = () => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    );
  };

  const handlePeriodChange = (nextPeriod: ConsumptionPeriodSelection) => {
    setPeriod(nextPeriod);
    resetPage();
  };

  const handleSearchChange = (nextSearch: string) => {
    setValue(nextSearch);
    resetPage();
  };

  const handleProviderChange = (values: string[]) => {
    setProviders(values.filter(isTriggerProviderFilter));
    resetPage();
  };

  const handleSortingChange = (nextSorting: SortingState) => {
    setSorting([nextSorting[0] ?? { id: "createdAt", desc: true }]);
    resetPage();
  };

  const orderColumn = toTriggerOrderColumn(sorting[0]?.id);
  const orderDirection = sorting[0]?.desc === false ? "asc" : "desc";

  const {
    triggers,
    totalTriggers,
    appliedOrderColumn,
    appliedOrderDirection,
    isTriggersLoading,
    isTriggersValidating,
    isTriggersError,
    mutateTriggers,
  } = usePokeTriggerSearch({
    owner,
    period,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
    search: debouncedValue || undefined,
    providers: providers.length > 0 ? providers : undefined,
    orderColumn,
    orderDirection,
  });
  const isUpdating = isDebouncing || isTriggersValidating;

  // The server can fall back from consumption ordering when analytics are
  // unavailable. Once the current response settles, reflect its actual order
  // and keep the controlled page within the returned result set.
  useEffect(() => {
    if (
      isDebouncing ||
      isTriggersLoading ||
      isTriggersValidating ||
      isTriggersError ||
      appliedOrderColumn === undefined ||
      appliedOrderDirection === undefined
    ) {
      return;
    }

    const lastPageIndex = Math.max(
      0,
      Math.ceil(totalTriggers / pagination.pageSize) - 1
    );
    setPagination((current) =>
      current.pageIndex > lastPageIndex
        ? { ...current, pageIndex: lastPageIndex }
        : current
    );

    const appliedDesc = appliedOrderDirection === "desc";
    setSorting((current) => {
      const currentSort = current[0];
      return current.length === 1 &&
        currentSort?.id === appliedOrderColumn &&
        currentSort.desc === appliedDesc
        ? current
        : [{ id: appliedOrderColumn, desc: appliedDesc }];
    });
  }, [
    appliedOrderColumn,
    appliedOrderDirection,
    isDebouncing,
    isTriggersError,
    isTriggersLoading,
    isTriggersValidating,
    pagination.pageSize,
    totalTriggers,
  ]);

  const onTriggerDeleted = async () => {
    await clearPokeTriggerCaches(owner);
    if (triggers.length === 1 && pagination.pageIndex > 0) {
      setPagination((current) => ({
        ...current,
        pageIndex: Math.max(0, current.pageIndex - 1),
      }));
      return;
    }
    await mutateTriggers();
  };

  const providerFacets = TRIGGER_PROVIDER_FACETS.map((facet) => ({
    ...facet,
    selectedValues: providers,
    onSelectedValuesChange: handleProviderChange,
  }));

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
        {isTriggersLoading ? (
          <div className="flex h-32 items-center justify-center" role="status">
            <Spinner />
            <span className="sr-only">Loading triggers</span>
          </div>
        ) : isTriggersError ? (
          <div className="flex h-32 items-center justify-center">
            <p>Error loading data.</p>
          </div>
        ) : (
          <PokeDataTable
            columns={makeColumnsForTriggers(owner, [], onTriggerDeleted, {
              disableActions: isUpdating,
              includeConsumption: true,
            })}
            data={triggers}
            facets={providerFacets}
            getRowId={(trigger) => trigger.sId}
            isValidating={isUpdating}
            serverSideRowCount={totalTriggers}
            pagination={pagination}
            onPaginationChange={setPagination}
            sorting={sorting}
            onSortingChange={handleSortingChange}
            search={inputValue}
            onSearchChange={handleSearchChange}
          />
        )}
      </div>
    </div>
  );
}

interface AgentTriggerDataTableProps {
  owner: LightWorkspaceType;
  agentId: string;
  loadOnInit?: boolean;
}

export function AgentTriggerDataTable({
  owner,
  agentId,
  loadOnInit,
}: AgentTriggerDataTableProps) {
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
        const filteredTriggers = triggers.filter(
          (trigger) => trigger.agentConfigurationId === agentId
        );
        const onTriggerDeleted = async () => {
          await clearPokeTriggerCaches(owner);
          await mutateTriggers();
        };

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
