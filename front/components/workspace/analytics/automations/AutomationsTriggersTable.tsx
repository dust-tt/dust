import { ConfirmContext } from "@app/components/Confirm";
import { getIcon } from "@app/components/resources/resources_icons";
import { TableSelectionBanner } from "@app/components/shared/TableSelectionBanner";
import { AutomationsFilterPanel } from "@app/components/workspace/analytics/automations/AutomationsFilterPanel";
import { AutomationsFilterSummary } from "@app/components/workspace/analytics/automations/AutomationsFilterSummary";
import type { TriggerRowData as BaseTriggerRowData } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import { AutomationsTriggersRowsTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import { BulkTriggerPoolModal } from "@app/components/workspace/analytics/automations/BulkTriggerPoolModal";
import { POOL_OPTIONS } from "@app/components/workspace/analytics/automations/trigger_pool_options";
import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import { toAutomationsTriggersFilter } from "@app/components/workspace/analytics/automationsFilter";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import {
  AvatarNameCell,
  CreditsCell,
  EntityTooltipCard,
} from "@app/components/workspace/analytics/creditsTableCells";
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
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  useBulkUpdateTriggerExecutionMode,
  useUpdateTriggerExecutionMode,
  useUpdateTriggerStatus,
} from "@app/lib/swr/agent_triggers";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
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
  ChevronDown,
  ChevronUp,
  Clock,
  ContentMessageAction,
  createSelectionColumn,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
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
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

const SEARCH_DEBOUNCE_DELAY_MS = 300;
const TRIGGERS_PAGE_SIZE = 25;

interface TriggerRowData extends BaseTriggerRowData {
  displayStatus: TriggerStatus;
  isStatusPending: boolean;
  onToggleStatus: () => void;
  displayExecutionMode: TriggerExecutionMode;
  isExecutionModePending: boolean;
  onSetExecutionMode: (executionMode: TriggerExecutionMode) => void;
}

function PoolCell({ row }: { row: TriggerRowData }) {
  const { hasPermission } = useWorkspacePermissions();
  const isWorkspacePool = row.displayExecutionMode === "workspace_pool";
  const canSetPool = hasPermission("use_workspace_pool", "trigger");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          isSelect
          disabled={row.isExecutionModePending || !canSetPool}
          className={isWorkspacePool ? "text-highlight" : undefined}
          label={isWorkspacePool ? "Workspace" : "Member"}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {POOL_OPTIONS.map(({ value, label }) => (
          <DropdownMenuItem
            key={value}
            label={label}
            onClick={() => row.onSetExecutionMode(value)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TypeCell({ trigger }: { trigger: AutomationTriggerRow }) {
  switch (trigger.kind) {
    case "schedule":
      return (
        <TypeLabel
          visual={Clock}
          label={trigger.scheduleDescription || "Schedule"}
        />
      );
    case "webhook":
      if (trigger.webhookSourceRestricted) {
        return (
          <TypeLabel
            visual={getIcon("ActionLockIcon")}
            label="This webhook lives in a space you don't have access to."
          />
        );
      }
      return (
        <TypeLabel
          visual={getIcon(normalizeWebhookIcon(trigger.webhookIcon))}
          label={
            trigger.webhookSourceName
              ? `${trigger.webhookSourceName} webhook`
              : "Webhook"
          }
        />
      );
    default:
      assertNeverAndIgnore(trigger.kind);
      return null;
  }
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

function TypeLabel({
  visual,
  label,
}: {
  visual: ComponentProps<typeof Icon>["visual"];
  label: string;
}) {
  return (
    <Tooltip
      label={label}
      tooltipTriggerAsChild
      trigger={
        <div className="flex min-w-0 items-center gap-2">
          <Icon visual={visual} size="xs" className="text-muted-foreground" />
        </div>
      }
    />
  );
}

function AgentCell({ agent }: { agent: AutomationTriggerRow["agent"] }) {
  const content = (
    <div className="min-w-0">
      <AvatarNameCell
        name={agent.name}
        imageUrl={agent.pictureUrl}
        size="xxs"
      />
    </div>
  );

  if (!agent.description) {
    return content;
  }

  return (
    <Tooltip
      label={
        <EntityTooltipCard
          avatar={
            <Avatar
              name={agent.name}
              visual={agent.pictureUrl ?? undefined}
              size="xs"
            />
          }
          name={agent.name}
          description={agent.description}
          modelId={agent.modelId}
          modelDisplayName={agent.modelDisplayName}
        />
      }
      className="p-3"
      tooltipTriggerAsChild
      trigger={content}
    />
  );
}

function EditorCell({ editor }: { editor: AutomationTriggerRow["editor"] }) {
  return (
    <Tooltip
      label={
        <div className="flex flex-col">
          <span>{editor.name}</span>
          {editor.email && <span>{editor.email}</span>}
        </div>
      }
      tooltipTriggerAsChild
      trigger={
        <div className="flex gap-2 items-center">
          <Avatar
            name={editor.name}
            visual={editor.pictureUrl ?? undefined}
            size="xs"
            isRounded
          />
          <span className="text-sm truncate">{editor.name}</span>
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
  showPoolColumn,
  showSelectionColumn,
}: {
  expandedRowId: string | null;
  showPoolColumn: boolean;
  showSelectionColumn: boolean;
}): ColumnDef<TriggerRowData>[] {
  return [
    ...(showSelectionColumn ? [rowSelectionColumn()] : []),
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      meta: { className: "truncate", headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start text-left">
          <span className="truncate text-sm font-semibold">
            {info.row.original.name}
          </span>
        </DataTable.CellContent>
      ),
    },
    {
      id: "editor",
      header: "Editor",
      enableSorting: false,
      meta: { className: "w-36", headerAlign: "center" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
          <EditorCell editor={info.row.original.editor} />
        </DataTable.CellContent>
      ),
    },
    {
      id: "agent",
      header: "Agent",
      enableSorting: false,
      meta: { className: "w-44", headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
          <AgentCell agent={info.row.original.agent} />
        </DataTable.CellContent>
      ),
    },
    {
      id: "type",
      header: "Type",
      enableSorting: false,
      meta: { className: "w-8" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-center">
          <TypeCell trigger={info.row.original} />
        </DataTable.CellContent>
      ),
    },
    {
      id: "credits",
      accessorKey: "credits",
      header: "Credits",
      meta: { className: "w-24", headerAlign: "right" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-end text-right">
          <CreditsCell credits={info.row.original.credits} />
        </DataTable.CellContent>
      ),
    },
    ...(showPoolColumn
      ? [
          {
            id: "pool",
            header: "Pool",
            enableSorting: false,
            meta: { className: "w-28" },
            cell: (info) => (
              <DataTable.CellContent className="w-full justify-start">
                <PoolCell row={info.row.original} />
              </DataTable.CellContent>
            ),
          } satisfies ColumnDef<TriggerRowData>,
        ]
      : []),
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
    {
      id: "details",
      header: "",
      enableSorting: false,
      meta: { className: "w-12" },
      cell: (info) => {
        const row = info.row.original;
        const isExpanded = expandedRowId === row.triggerId;
        return (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              icon={isExpanded ? ChevronUp : ChevronDown}
              variant="ghost-secondary"
              size="xs"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} breakdown for ${row.name}`}
              aria-expanded={isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                row.onClick();
              }}
            />
          </DataTable.CellContent>
        );
      },
    },
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

  const { hasFeature } = useFeatureFlags();
  const showPoolColumn = hasFeature("trigger_pool_choice");
  const { hasPermission } = useWorkspacePermissions();
  const canBulkSetPool =
    showPoolColumn && hasPermission("use_workspace_pool", "trigger");

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
          message: `"${trigger.name}" will stop running for ${trigger.editor.name}. A manager or admin will be able to re-enable it.`,
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
            filter={filter}
            onFilterChange={onFilterChange}
          />
          <CsvDownloadButton {...csvDownload} size="sm" />
        </div>
        <AutomationsFilterSummary
          filter={filter}
          onFilterChange={onFilterChange}
        />
        {canBulkSetPool && (
          <TableSelectionBanner
            selectedCount={selection.selectedCount}
            pageCount={pageTriggerIds.length}
            totalCount={totalCount}
            itemLabel="automation"
            isAllAcrossPagesSelected={selection.isAllAcrossPagesSelected}
            hasMorePagesToSelect={selection.hasMorePagesToSelect}
            onSelectAllAcrossPages={selection.selectAllAcrossPages}
            onClear={selection.clearSelection}
          >
            <ContentMessageAction
              variant="primary"
              label="Set pool"
              onClick={() => setIsBulkPoolOpen(true)}
            />
          </TableSelectionBanner>
        )}
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
        showPoolColumn={showPoolColumn}
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
  showPoolColumn: boolean;
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
  showPoolColumn,
  showSelectionColumn,
  rowSelection,
  onRowSelectionChange,
}: TriggersTableBodyProps) {
  const columns = useMemo(
    () => buildColumns({ expandedRowId, showPoolColumn, showSelectionColumn }),
    [expandedRowId, showPoolColumn, showSelectionColumn]
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
          ? `No match for "${search.trim()}".`
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
