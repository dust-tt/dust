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
import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import {
  toUserAutomationsTriggersFilter,
  USER_AUTOMATIONS_FILTER_CATEGORIES,
} from "@app/components/workspace/analytics/automationsFilter";
import { useDebounce } from "@app/hooks/useDebounce";
import { useSendNotification } from "@app/hooks/useNotification";
import { useUserAutomationsTriggers } from "@app/hooks/useUserAutomationsTriggers";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import {
  useDeleteTrigger,
  useUpdateTriggerExecutionMode,
  useUpdateTriggerStatus,
} from "@app/lib/swr/agent_triggers";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { isManager } from "@app/types/user";
import {
  Button,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyCTA,
  Pagination,
  SearchInput,
  SliderToggle,
  Spinner,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const SEARCH_DEBOUNCE_DELAY_MS = 300;
const TRIGGERS_PAGE_SIZE = 10;

// TODO(2026-08-25 AUTOMATIONS): link to be provided.
const SETUP_TRIGGER_URL = "#";
const TRIGGERS_DOC_URL =
  "https://docs.dust.tt/docs/user-documentation/agents/triggers/schedules";
const WAKEUPS_DOC_URL =
  "https://docs.dust.tt/docs/user-documentation/agents/tools/wake-ups";

interface TriggerRowData extends BaseTriggerRowData, PoolRowFields {
  isStatusPending: boolean;
  onToggleStatus: () => void;
  onDelete: () => void;
}

function LockedToggle({ label }: { label: string }) {
  return (
    <Tooltip
      label={label}
      trigger={
        // A disabled SliderToggle needs a wrapper to be a valid Tooltip
        // trigger.
        <div>
          <SliderToggle selected={false} disabled />
        </div>
      }
    />
  );
}

function RunningCell({
  row,
  canEnableManagerDisabled,
}: {
  row: TriggerRowData;
  canEnableManagerDisabled: boolean;
}) {
  switch (row.status) {
    case "enabled":
    case "disabled":
      return (
        <SliderToggle
          selected={row.status === "enabled"}
          disabled={row.isStatusPending}
          onClick={(event) => {
            event.stopPropagation();
            row.onToggleStatus();
          }}
        />
      );
    case "disabled_by_manager":
      return canEnableManagerDisabled ? (
        <SliderToggle
          selected={false}
          disabled={row.isStatusPending}
          onClick={(event) => {
            event.stopPropagation();
            row.onToggleStatus();
          }}
        />
      ) : (
        <LockedToggle label="Disabled by a manager or admin, who can re-enable it." />
      );
    case "relocating":
      return (
        <LockedToggle label="Disabled while the workspace is being relocated." />
      );
    case "downgraded":
      return <LockedToggle label="Disabled following a plan downgrade." />;
    default:
      assertNeverAndIgnore(row.status);
      return <LockedToggle label="This automation is managed by Dust." />;
  }
}

function ActionsCell({
  row,
  workspaceId,
}: {
  row: TriggerRowData;
  workspaceId: string;
}) {
  // A trigger on a global agent has no builder page to manage it from.
  if (isGlobalAgentId(row.agent.agentId)) {
    return (
      <Button
        variant="outline"
        size="xs"
        icon={Trash01}
        tooltip="Delete automation"
        onClick={(event) => {
          event.stopPropagation();
          row.onDelete();
        }}
      />
    );
  }

  return (
    <Button
      variant="outline"
      size="xs"
      label="Manage"
      href={getAgentBuilderRoute(workspaceId, row.agent.agentId)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function buildColumns({
  workspaceId,
  expandedRowId,
  canEnableManagerDisabled,
}: {
  workspaceId: string;
  expandedRowId: string | null;
  canEnableManagerDisabled: boolean;
}): ColumnDef<TriggerRowData>[] {
  return [
    nameColumn(),
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
          <RunningCell
            row={info.row.original}
            canEnableManagerDisabled={canEnableManagerDisabled}
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { className: "w-24" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-end">
          <ActionsCell row={info.row.original} workspaceId={workspaceId} />
        </DataTable.CellContent>
      ),
    },
    detailsColumn(expandedRowId),
  ];
}

interface UserAutomationsTableProps {
  owner: LightWorkspaceType;
}

export function UserAutomationsTable({ owner }: UserAutomationsTableProps) {
  const workspaceId = owner.sId;
  const canEnableManagerDisabled = isManager(owner);
  const period = DEFAULT_CONSUMPTION_PERIOD;

  const [filter, setFilter] = useState<AutomationsFilter>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: TRIGGERS_PAGE_SIZE,
  });
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_DELAY_MS,
  });

  const triggersFilter = useMemo(
    () => toUserAutomationsTriggersFilter(filter),
    [filter]
  );

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
    agents,
    totalCount,
    medianRunCount,
    medianCostPerRun,
    isConsumptionAvailable,
    mutateTriggers,
    isTriggersLoading,
    isTriggersError,
  } = useUserAutomationsTriggers({
    workspaceId,
    period,
    search: debouncedValue,
    filter: triggersFilter,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
  });

  const sendNotification = useSendNotification();
  const updateTriggerStatus = useUpdateTriggerStatus({ workspaceId });
  const updateTriggerExecutionMode = useUpdateTriggerExecutionMode({
    workspaceId,
  });
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingExecutionModeIds, setPendingExecutionModeIds] = useState<
    ReadonlySet<string>
  >(new Set());

  const [triggerToDelete, setTriggerToDelete] =
    useState<AutomationTriggerRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteTrigger = useDeleteTrigger({
    workspaceId,
    agentConfigurationId: triggerToDelete?.agent.agentId ?? "",
  });

  const handleToggle = useCallback(
    async (trigger: AutomationTriggerRow) => {
      setPendingIds((ids) => new Set([...ids, trigger.triggerId]));
      await updateTriggerStatus({
        agentConfigurationId: trigger.agent.agentId,
        triggerId: trigger.triggerId,
        status: trigger.status === "enabled" ? "disabled" : "enabled",
      });
      await mutateTriggers();
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(trigger.triggerId);
        return next;
      });
    },
    [mutateTriggers, updateTriggerStatus]
  );

  const handleSetExecutionMode = useCallback(
    async (
      trigger: AutomationTriggerRow,
      executionMode: TriggerExecutionMode
    ) => {
      setPendingExecutionModeIds((ids) => new Set([...ids, trigger.triggerId]));
      await updateTriggerExecutionMode({
        agentConfigurationId: trigger.agent.agentId,
        triggerId: trigger.triggerId,
        executionMode,
      });
      await mutateTriggers();
      setPendingExecutionModeIds((ids) => {
        const next = new Set(ids);
        next.delete(trigger.triggerId);
        return next;
      });
    },
    [mutateTriggers, updateTriggerExecutionMode]
  );

  const handleDelete = async () => {
    if (!triggerToDelete) {
      return;
    }
    setIsDeleting(true);
    const success = await deleteTrigger(triggerToDelete.triggerId);
    setIsDeleting(false);
    setTriggerToDelete(null);

    if (success) {
      await mutateTriggers();
      sendNotification({
        type: "success",
        title: "Automation deleted",
        description: `The automation "${triggerToDelete.name}" has been deleted.`,
      });
    } else {
      sendNotification({
        type: "error",
        title: "Failed to delete automation",
        description: "An error occurred while deleting the automation.",
      });
    }
  };

  const rows: TriggerRowData[] = useMemo(
    () =>
      triggers.map((trigger) => ({
        ...trigger,
        isStatusPending: pendingIds.has(trigger.triggerId),
        onToggleStatus: () => void handleToggle(trigger),
        onDelete: () => setTriggerToDelete(trigger),
        displayExecutionMode: trigger.executionMode,
        isExecutionModePending: pendingExecutionModeIds.has(trigger.triggerId),
        onSetExecutionMode: (executionMode: TriggerExecutionMode) =>
          void handleSetExecutionMode(trigger, executionMode),
        onClick: () =>
          setExpandedRowId((current) =>
            current === trigger.triggerId ? null : trigger.triggerId
          ),
      })),
    [
      triggers,
      pendingIds,
      handleToggle,
      pendingExecutionModeIds,
      handleSetExecutionMode,
    ]
  );

  const columns = useMemo(
    () =>
      buildColumns({
        workspaceId,
        expandedRowId,
        canEnableManagerDisabled,
      }),
    [workspaceId, expandedRowId, canEnableManagerDisabled]
  );

  const firstRowIndex = pagination.pageIndex * pagination.pageSize;
  const skeletonRowCount =
    totalCount > firstRowIndex
      ? Math.min(pagination.pageSize, totalCount - firstRowIndex)
      : pagination.pageSize;

  const hasActiveQuery =
    debouncedValue.trim().length > 0 || Object.keys(triggersFilter).length > 0;
  // No automations at all (as opposed to a search/filter matching nothing):
  // the empty state replaces the search and filter controls.
  const showEmptyState =
    !isTriggersError &&
    !isTriggersLoading &&
    rows.length === 0 &&
    !hasActiveQuery;

  return (
    <div className="flex flex-1 flex-col gap-2">
      {!showEmptyState && (
        <>
          <div className="flex items-center gap-2">
            <SearchInput
              name="user-automations-search"
              placeholder="Search automations"
              value={inputValue}
              onChange={setValue}
              className="flex-1"
            />
            <AutomationsFilterPanel
              owner={owner}
              period={period}
              filter={filter}
              onFilterChange={setFilter}
              categories={USER_AUTOMATIONS_FILTER_CATEGORIES}
              agentOptions={agents}
            />
          </div>
          <AutomationsFilterSummary
            filter={filter}
            onFilterChange={setFilter}
            categories={USER_AUTOMATIONS_FILTER_CATEGORIES}
          />
        </>
      )}

      {!isConsumptionAvailable && (
        <div className="text-sm text-muted-foreground">
          Credit usage is temporarily unavailable.
        </div>
      )}

      {isTriggersError ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Failed to load your automations.
        </div>
      ) : !isTriggersLoading && rows.length === 0 ? (
        hasActiveQuery ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No automation matches your search criteria.
          </div>
        ) : (
          <EmptyCTA
            className="flex-1"
            title="Create your first automation"
            message="Triggers start automations when something happens. Agents can also start them with wakeups."
            action={
              <div className="mt-4 flex flex-col items-center gap-3">
                <Button
                  label="Set up a trigger"
                  variant="highlight"
                  href={SETUP_TRIGGER_URL}
                />
                <div className="flex items-center gap-2">
                  <Button
                    label="Learn about triggers"
                    variant="ghost-secondary"
                    href={TRIGGERS_DOC_URL}
                    target="_blank"
                  />
                  <Button
                    label="Learn about wakeups"
                    variant="ghost-secondary"
                    href={WAKEUPS_DOC_URL}
                    target="_blank"
                  />
                </div>
              </div>
            }
          />
        )
      ) : (
        <div aria-busy={isTriggersLoading || undefined}>
          <div className="overflow-x-auto">
            <AutomationsTriggersRowsTable
              data={rows}
              columns={columns}
              workspaceId={workspaceId}
              period={period}
              scope="user"
              expandedRowId={expandedRowId}
              medianRunCount={medianRunCount}
              medianCostPerRun={medianCostPerRun}
              isLoading={isTriggersLoading}
              skeletonRowCount={skeletonRowCount}
            />
          </div>
          {totalCount > pagination.pageSize && (
            <div className="mt-2 p-1">
              <Pagination
                size="xs"
                showDetails={false}
                pagination={pagination}
                setPagination={setPagination}
                rowCount={totalCount}
              />
            </div>
          )}
        </div>
      )}

      <Dialog
        open={triggerToDelete !== null}
        onOpenChange={(open) => !open && setTriggerToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete automation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{triggerToDelete?.name}"?
            </DialogDescription>
          </DialogHeader>
          {isDeleting ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <>
              <DialogContainer>
                <b>This action cannot be undone.</b>
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: "Cancel",
                  variant: "outline",
                }}
                rightButtonProps={{
                  label: "Delete",
                  variant: "warning",
                  onClick: handleDelete,
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
