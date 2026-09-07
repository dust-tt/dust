import { ConfirmContext } from "@app/components/Confirm";
import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
import { AutomationsFilterPanel } from "@app/components/workspace/analytics/automations/AutomationsFilterPanel";
import { AutomationsFilterSummary } from "@app/components/workspace/analytics/automations/AutomationsFilterSummary";
import type { TriggerRowData as BaseTriggerRowData } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import { AutomationsTriggersRowsTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import type { PoolRowFields } from "@app/components/workspace/analytics/automations/automationsTriggerColumns";
import {
  agentColumn,
  creditsColumn,
  detailsColumn,
  nameColumn,
  poolColumn,
  typeColumn,
} from "@app/components/workspace/analytics/automations/automationsTriggerColumns";
import { BulkTriggerPoolModal } from "@app/components/workspace/analytics/automations/BulkTriggerPoolModal";
import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import { toAutomationsTriggersFilter } from "@app/components/workspace/analytics/automationsFilter";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { useAutomationsTriggers } from "@app/hooks/useAutomationsTriggers";
import { useDebounce } from "@app/hooks/useDebounce";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import { useTableRowsSelection } from "@app/hooks/useTableRowsSelection";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type {
  AutomationTriggersBody,
  AutomationTriggersQuery,
} from "@app/lib/api/analytics/automations/schema";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import type { BulkTriggerSelection } from "@app/lib/api/triggers/bulk_selection";
import {
  useBulkUpdateTriggerExecutionMode,
  useUpdateTriggerExecutionMode,
  useUpdateTriggerStatus,
} from "@app/lib/swr/agent_triggers";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type {
  TriggerExecutionMode,
  TriggerStatus,
} from "@app/types/assistant/triggers";
import { getTriggerStatusOwner } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  createSelectionColumn,
  DataTable,
  Pagination,
  SearchInput,
  SliderToggle,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

const SEARCH_DEBOUNCE_DELAY_MS = 300;
const TRIGGERS_PAGE_SIZE = 25;

interface TriggerRowData extends BaseTriggerRowData, PoolRowFields {
  displayStatus: TriggerStatus;
  isStatusPending: boolean;
  onToggleStatus: () => void;
}

function RunningCell({ row }: { row: TriggerRowData }) {
  switch (row.displayStatus) {
    case "enabled":
    case "disabled":
    case "disabled_by_manager":
      return (
        <SliderToggle
          selected={row.displayStatus === "enabled"}
          disabled={row.isStatusPending}
          onClick={row.onToggleStatus}
        />
      );
    case "relocating":
    case "downgraded":
      return (
        <Tooltip
          label={
            row.displayStatus === "relocating"
              ? "Disabled while the workspace is being relocated."
              : "Disabled following a plan downgrade."
          }
          trigger={
            // A disabled SliderToggle needs a wrapper to be a valid Tooltip
            // trigger.
            <div>
              <SliderToggle selected={false} disabled />
            </div>
          }
        />
      );
    default:
      assertNeverAndIgnore(row.displayStatus);
      return (
        <SliderToggle
          selected={row.displayStatus === "enabled"}
          disabled={row.isStatusPending}
          onClick={row.onToggleStatus}
        />
      );
  }
}

function OwnerCell({ owner }: { owner: AutomationTriggerRow["owner"] }) {
  return (
    <Tooltip
      label={
        <div className="flex flex-col">
          <span>{owner.name}</span>
          {owner.email && <span>{owner.email}</span>}
        </div>
      }
      tooltipTriggerAsChild
      trigger={
        <div className="flex gap-2 items-center">
          <Avatar
            name={owner.name}
            visual={owner.pictureUrl ?? undefined}
            size="xs"
            isRounded
          />
          <span className="text-sm truncate">{owner.name}</span>
        </div>
      }
    />
  );
}

// The row is clickable to expand its breakdown, so ticking its checkbox must
// not bubble up to it.
function rowSelectionColumn(): ColumnDef<TriggerRowData> {
  const column = createSelectionColumn<TriggerRowData>();
  return {
    ...column,
    cell: (context) => (
      <div
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {flexRender(column.cell, context)}
      </div>
    ),
  };
}

function buildColumns({
  expandedRowId,
  showSelectionColumn,
}: {
  expandedRowId: string | null;
  showSelectionColumn: boolean;
}): ColumnDef<TriggerRowData>[] {
  return [
    ...(showSelectionColumn ? [rowSelectionColumn()] : []),
    nameColumn(),
    {
      id: "owner",
      header: "Owner",
      enableSorting: false,
      meta: { className: "w-36", headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
          <OwnerCell owner={info.row.original.owner} />
        </DataTable.CellContent>
      ),
    },
    agentColumn(),
    typeColumn(),
    creditsColumn(),
    poolColumn(),
    {
      id: "status",
      header: "Enabled",
      enableSorting: false,
      meta: { className: "w-16" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-center">
          <RunningCell row={info.row.original} />
        </DataTable.CellContent>
      ),
    },
    detailsColumn(expandedRowId),
  ];
}

interface AutomationsTriggersTableProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  filter: AutomationsFilter;
  onFilterChange: (next: AutomationsFilter) => void;
}

export function AutomationsTriggersTable({
  owner,
  period,
  filter,
  onFilterChange,
}: AutomationsTriggersTableProps) {
  const workspaceId = owner.sId;
  const triggersFilter = useMemo(
    () => toAutomationsTriggersFilter(filter),
    [filter]
  );

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: TRIGGERS_PAGE_SIZE,
  });
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_DELAY_MS,
  });

  // A filter or search change invalidates the current page and any expanded
  // row. Reset during render
  // (https://react.dev/learn/you-might-not-need-an-effect) instead of an
  // effect keyed on the query.
  const [prevQuery, setPrevQuery] = useState({
    filter,
    search: debouncedValue,
  });
  if (prevQuery.filter !== filter || prevQuery.search !== debouncedValue) {
    setPrevQuery({ filter, search: debouncedValue });
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setExpandedRowId(null);
  }

  const {
    triggers,
    totalCount,
    medianRunCount,
    medianCostPerRun,
    mutateTriggers,
    isTriggersLoading,
    isTriggersError,
  } = useAutomationsTriggers({
    workspaceId,
    period,
    search: debouncedValue,
    filter: triggersFilter,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
  });

  const confirm = useContext(ConfirmContext);
  const updateTriggerStatus = useUpdateTriggerStatus({ workspaceId });
  const updateTriggerExecutionMode = useUpdateTriggerExecutionMode({
    workspaceId,
  });

  const { hasPermission } = useWorkspacePermissions();
  const canBulkSetPool = hasPermission("use_workspace_pool", "trigger");

  const triggersQuery: AutomationTriggersQuery = useMemo(
    () => ({
      period: period.kind,
      days:
        period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
      search: debouncedValue.trim() || undefined,
      filter: triggersFilter,
    }),
    [period, debouncedValue, triggersFilter]
  );

  const exportBody: AutomationTriggersBody = {
    ...triggersQuery,
    limit: TRIGGERS_PAGE_SIZE,
    offset: 0,
    format: "csv",
  };
  const exportDate = new Date().toISOString().slice(0, 10);
  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/automations/triggers`,
    filename: `dust_automations_${exportDate}.csv`,
    body: exportBody,
    disabled: isTriggersLoading || !!isTriggersError || totalCount === 0,
  });

  // The table data comes from an expensive Elasticsearch query, so instead of
  // revalidating after a toggle we track the new statuses locally.
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, TriggerStatus>
  >({});
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [executionModeOverrides, setExecutionModeOverrides] = useState<
    Record<string, TriggerExecutionMode>
  >({});
  const [pendingExecutionModeIds, setPendingExecutionModeIds] = useState<
    ReadonlySet<string>
  >(new Set());

  // Refetched rows (pagination, period change) already carry any status we
  // wrote, so overrides only need to live until the next fetch. Reset during
  // render (https://react.dev/learn/you-might-not-need-an-effect). A fetch
  // that straddles a toggle can briefly show the pre-toggle status; the next
  // fetch self-heals it.
  const [prevTriggers, setPrevTriggers] = useState(triggers);
  if (prevTriggers !== triggers) {
    setPrevTriggers(triggers);
    setStatusOverrides({});
    setExecutionModeOverrides({});
  }

  const handleToggle = useCallback(
    async (trigger: AutomationTriggerRow, currentStatus: TriggerStatus) => {
      if (getTriggerStatusOwner(currentStatus) === "system") {
        return;
      }
      const nextStatus = currentStatus === "enabled" ? "disabled" : "enabled";

      if (nextStatus === "disabled") {
        const confirmed = await confirm({
          title: "Disable this automation?",
          message: `"${trigger.name}" will stop running for ${trigger.owner.name}. A manager or admin will be able to re-enable it.`,
          validateVariant: "warning",
          validateLabel: "Disable",
          cancelLabel: "Cancel",
        });
        if (!confirmed) {
          return;
        }
      }

      setPendingIds((ids) => new Set([...ids, trigger.triggerId]));
      const success = await updateTriggerStatus({
        agentConfigurationId: trigger.agent.agentId,
        triggerId: trigger.triggerId,
        status: nextStatus,
      });
      if (success) {
        // Anyone who can reach this page is a manager or admin, so the
        // server always stores a disable from here as disabled_by_manager.
        setStatusOverrides((overrides) => ({
          ...overrides,
          [trigger.triggerId]:
            nextStatus === "disabled" ? "disabled_by_manager" : "enabled",
        }));
      }
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(trigger.triggerId);
        return next;
      });
    },
    [confirm, updateTriggerStatus]
  );

  const handleSetExecutionMode = useCallback(
    async (
      trigger: AutomationTriggerRow,
      executionMode: TriggerExecutionMode
    ) => {
      setPendingExecutionModeIds((ids) => new Set([...ids, trigger.triggerId]));
      const success = await updateTriggerExecutionMode({
        agentConfigurationId: trigger.agent.agentId,
        triggerId: trigger.triggerId,
        executionMode,
      });
      if (success) {
        setExecutionModeOverrides((overrides) => ({
          ...overrides,
          [trigger.triggerId]: executionMode,
        }));
      }
      setPendingExecutionModeIds((ids) => {
        const next = new Set(ids);
        next.delete(trigger.triggerId);
        return next;
      });
    },
    [updateTriggerExecutionMode]
  );

  const pageTriggerIds = useMemo(
    () => triggers.map((trigger) => trigger.triggerId),
    [triggers]
  );
  const selection = useTableRowsSelection({
    pageItemIds: pageTriggerIds,
    totalCount,
    resetKey: JSON.stringify([triggersFilter, debouncedValue, period]),
  });

  const buildBulkSelectionBody = useCallback((): BulkTriggerSelection => {
    const descriptor = selection.descriptor();
    return descriptor.mode === "ids"
      ? { mode: "ids", triggerIds: descriptor.ids }
      : {
          mode: "all",
          query: triggersQuery,
          excludeTriggerIds: descriptor.excludedIds,
        };
  }, [selection, triggersQuery]);

  // Only the selected rows of the current page are visible, so those are the
  // ones that get a pending state while the bulk request runs.
  const pendingBulkTriggerIds = useMemo(
    () => pageTriggerIds.filter((id) => selection.rowSelection[id]),
    [pageTriggerIds, selection.rowSelection]
  );

  const bulkUpdateTriggerExecutionMode = useBulkUpdateTriggerExecutionMode({
    workspaceId,
  });
  const [isBulkPoolOpen, setIsBulkPoolOpen] = useState(false);

  const handleBulkExecutionMode = useCallback(
    async (executionMode: TriggerExecutionMode): Promise<boolean> => {
      setPendingExecutionModeIds(
        (ids) => new Set([...ids, ...pendingBulkTriggerIds])
      );
      try {
        const outcome = await bulkUpdateTriggerExecutionMode({
          selection: buildBulkSelectionBody(),
          executionMode,
        });
        if (!outcome) {
          return false;
        }
        selection.clearSelection();
        await mutateTriggers();
        return true;
      } finally {
        setPendingExecutionModeIds((ids) => {
          const next = new Set(ids);
          pendingBulkTriggerIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [
      selection,
      pendingBulkTriggerIds,
      bulkUpdateTriggerExecutionMode,
      buildBulkSelectionBody,
      mutateTriggers,
    ]
  );

  const rows: TriggerRowData[] = useMemo(
    () =>
      triggers.map((trigger) => {
        const displayStatus =
          statusOverrides[trigger.triggerId] ?? trigger.status;
        return {
          ...trigger,
          displayStatus,
          isStatusPending: pendingIds.has(trigger.triggerId),
          onToggleStatus: () => void handleToggle(trigger, displayStatus),
          displayExecutionMode:
            executionModeOverrides[trigger.triggerId] ?? trigger.executionMode,
          isExecutionModePending: pendingExecutionModeIds.has(
            trigger.triggerId
          ),
          onSetExecutionMode: (executionMode: TriggerExecutionMode) =>
            void handleSetExecutionMode(trigger, executionMode),
          onClick: () =>
            setExpandedRowId((current) =>
              current === trigger.triggerId ? null : trigger.triggerId
            ),
        };
      }),
    [
      triggers,
      statusOverrides,
      pendingIds,
      handleToggle,
      executionModeOverrides,
      pendingExecutionModeIds,
      handleSetExecutionMode,
    ]
  );

  return (
    <>
      <div className="rounded-lg border border-border bg-panel-background p-4">
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <SearchInput
              name="automations-triggers-search"
              placeholder="Search…"
              value={inputValue}
              onChange={setValue}
              className="flex-1"
            />
            <AutomationsFilterPanel
              owner={owner}
              period={period}
              filter={filter}
              onFilterChange={onFilterChange}
            />
            <CsvDownloadButton {...csvDownload} size="sm" />
          </div>
          <AutomationsFilterSummary
            filter={filter}
            onFilterChange={onFilterChange}
          />
        </div>
        <TriggersTableBody
          isLoading={isTriggersLoading}
          isError={!!isTriggersError}
          search={debouncedValue}
          rows={rows}
          totalCount={totalCount}
          medianRunCount={medianRunCount}
          medianCostPerRun={medianCostPerRun}
          pagination={pagination}
          setPagination={setPagination}
          workspaceId={workspaceId}
          period={period}
          expandedRowId={expandedRowId}
          showSelectionColumn={canBulkSetPool}
          rowSelection={selection.rowSelection}
          onRowSelectionChange={selection.onRowSelectionChange}
        />
        <BulkTriggerPoolModal
          isOpen={isBulkPoolOpen}
          onClose={() => setIsBulkPoolOpen(false)}
          triggerCount={selection.selectedCount}
          onValidate={handleBulkExecutionMode}
        />
      </div>
      {canBulkSetPool && (
        <BulkSelectionBar
          selectedCount={selection.selectedCount}
          totalCount={totalCount}
          itemLabel="automation"
          canSelectAll={selection.hasMorePagesToSelect}
          onSelectAll={selection.selectAllAcrossPages}
          onClear={selection.clearSelection}
        >
          <Button
            size="sm"
            variant="primary"
            label="Set pool"
            onClick={() => setIsBulkPoolOpen(true)}
          />
        </BulkSelectionBar>
      )}
    </>
  );
}

interface TriggersTableBodyProps {
  isLoading: boolean;
  isError: boolean;
  search: string;
  rows: TriggerRowData[];
  totalCount: number;
  medianRunCount: number;
  medianCostPerRun: number;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  expandedRowId: string | null;
  showSelectionColumn: boolean;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (selection: RowSelectionState) => void;
}

function TriggersTableBody({
  isLoading,
  isError,
  search,
  rows,
  totalCount,
  medianRunCount,
  medianCostPerRun,
  pagination,
  setPagination,
  workspaceId,
  period,
  expandedRowId,
  showSelectionColumn,
  rowSelection,
  onRowSelectionChange,
}: TriggersTableBodyProps) {
  const columns = useMemo(
    () => buildColumns({ expandedRowId, showSelectionColumn }),
    [expandedRowId, showSelectionColumn]
  );

  const firstRowIndex = pagination.pageIndex * pagination.pageSize;
  const skeletonRowCount =
    totalCount > firstRowIndex
      ? Math.min(pagination.pageSize, totalCount - firstRowIndex)
      : pagination.pageSize;
  const paginationControls = totalCount > pagination.pageSize && (
    <div className="mt-2 p-1">
      <Pagination
        size="xs"
        showDetails={false}
        pagination={pagination}
        setPagination={setPagination}
        rowCount={totalCount}
      />
    </div>
  );

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load triggers.
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {search.trim()
          ? `No results for "${search.trim()}". Only items with usage data appear here.`
          : "No automation ran over this period."}
      </div>
    );
  }

  return (
    <div aria-busy={isLoading || undefined}>
      <div className="overflow-x-auto">
        <AutomationsTriggersRowsTable
          data={rows}
          columns={columns}
          workspaceId={workspaceId}
          period={period}
          scope="workspace"
          expandedRowId={expandedRowId}
          medianRunCount={medianRunCount}
          medianCostPerRun={medianCostPerRun}
          isLoading={isLoading}
          skeletonRowCount={skeletonRowCount}
          rowSelection={rowSelection}
          onRowSelectionChange={onRowSelectionChange}
        />
      </div>
      {paginationControls}
    </div>
  );
}
