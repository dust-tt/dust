import { ConfirmContext } from "@app/components/Confirm";
import { getIcon } from "@app/components/resources/resources_icons";
import { AutomationsFilterPanel } from "@app/components/workspace/analytics/automations/AutomationsFilterPanel";
import { AutomationsFilterSummary } from "@app/components/workspace/analytics/automations/AutomationsFilterSummary";
import type { TriggerRowData as BaseTriggerRowData } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import { AutomationsTriggersRowsTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
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
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggersBody } from "@app/lib/api/analytics/automations/schema";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { useUpdateTriggerStatus } from "@app/lib/swr/agent_triggers";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import type { TriggerStatus } from "@app/types/assistant/triggers";
import { getTriggerStatusOwner } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ChevronDown,
  ChevronUp,
  Clock,
  DataTable,
  DataTableLoadingSkeleton,
  Icon,
  Pagination,
  SearchInput,
  SliderToggle,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

const SEARCH_DEBOUNCE_DELAY_MS = 300;
const TRIGGERS_PAGE_SIZE = 25;

interface TriggerRowData extends BaseTriggerRowData {
  displayStatus: TriggerStatus;
  isStatusPending: boolean;
  onToggleStatus: () => void;
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
          <Tooltip
            label="This webhook lives in a space you don't have access to."
            tooltipTriggerAsChild
            trigger={
              <div>
                <TypeLabel
                  visual={getIcon("ActionLockIcon")}
                  label="Restricted webhook"
                />
              </div>
            }
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
          <span className="truncate text-sm">{label}</span>
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
        <div className="flex items-center">
          <Avatar
            name={editor.name}
            visual={editor.pictureUrl ?? undefined}
            size="xs"
            isRounded
          />
        </div>
      }
    />
  );
}

function buildColumns({
  expandedRowId,
}: {
  expandedRowId: string | null;
}): ColumnDef<TriggerRowData>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      meta: { className: "w-48", headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start text-left">
          <span className="truncate text-sm">{info.row.original.name}</span>
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
      id: "editor",
      header: "Editor",
      enableSorting: false,
      meta: { className: "w-16", headerAlign: "center" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-center">
          <EditorCell editor={info.row.original.editor} />
        </DataTable.CellContent>
      ),
    },
    {
      id: "type",
      header: "Type",
      enableSorting: false,
      meta: { headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
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
    {
      id: "status",
      header: "Enabled",
      enableSorting: false,
      meta: { className: "w-24" },
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

  const exportBody: AutomationTriggersBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit: TRIGGERS_PAGE_SIZE,
    offset: 0,
    search: debouncedValue.trim() || undefined,
    filter: triggersFilter,
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

  // Refetched rows (pagination, period change) already carry any status we
  // wrote, so overrides only need to live until the next fetch. Reset during
  // render (https://react.dev/learn/you-might-not-need-an-effect). A fetch
  // that straddles a toggle can briefly show the pre-toggle status; the next
  // fetch self-heals it.
  const [prevTriggers, setPrevTriggers] = useState(triggers);
  if (prevTriggers !== triggers) {
    setPrevTriggers(triggers);
    setStatusOverrides({});
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
          onClick: () =>
            setExpandedRowId((current) =>
              current === trigger.triggerId ? null : trigger.triggerId
            ),
        };
      }),
    [triggers, statusOverrides, pendingIds, handleToggle]
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
}: TriggersTableBodyProps) {
  const columns = useMemo(
    () => buildColumns({ expandedRowId }),
    [expandedRowId]
  );

  if (isLoading) {
    return (
      <DataTableLoadingSkeleton showSelectionColumn={false} showTrailingCell />
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load triggers.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {search.trim()
          ? `No match for "${search.trim()}".`
          : "No automation ran over this period."}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <AutomationsTriggersRowsTable
          data={rows}
          columns={columns}
          workspaceId={workspaceId}
          period={period}
          expandedRowId={expandedRowId}
          medianRunCount={medianRunCount}
          medianCostPerRun={medianCostPerRun}
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
  );
}
