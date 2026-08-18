import { ConfirmContext } from "@app/components/Confirm";
import { getIcon } from "@app/components/resources/resources_icons";
import {
  AvatarNameCell,
  CreditsCell,
  EntityTooltipCard,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useAutomationsTriggers } from "@app/hooks/useAutomationsTriggers";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useUpdateTriggerStatus } from "@app/lib/swr/agent_triggers";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import type { TriggerStatus } from "@app/types/assistant/triggers";
import { getTriggerStatusOwner } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Avatar,
  Clock,
  DataTable,
  DataTableLoadingSkeleton,
  Icon,
  SliderToggle,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

const TRIGGERS_PAGE_SIZE = 25;

interface TriggerRowData extends AutomationTriggerRow {
  displayStatus: TriggerStatus;
  isStatusPending: boolean;
  onToggleStatus: () => void;
  // onClick satisfies DataTable's row shape, which is otherwise a weak type.
  onClick?: () => void;
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
    case "disabled_by_admin":
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
      return null;
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
    <div className="flex items-center gap-2">
      <Icon visual={visual} size="xs" className="text-muted-foreground" />
      <span className="truncate text-sm">{label}</span>
    </div>
  );
}

function AgentCell({ agent }: { agent: AutomationTriggerRow["agent"] }) {
  const content = (
    <div className="min-w-0">
      <AvatarNameCell name={agent.name} imageUrl={agent.pictureUrl} />
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

const columns: ColumnDef<TriggerRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    meta: { className: "w-56", headerAlign: "left" },
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
    id: "runCount",
    accessorKey: "runCount",
    header: "Runs",
    meta: { className: "w-20", headerAlign: "right" },
    cell: (info) => (
      <DataTable.BasicCellContent
        className="justify-end text-right tabular-nums"
        label={info.row.original.runCount.toLocaleString()}
      />
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
    meta: { className: "w-24", headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start">
        <RunningCell row={info.row.original} />
      </DataTable.CellContent>
    ),
  },
];

interface AutomationsTriggersTableProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
}

export function AutomationsTriggersTable({
  workspaceId,
  period,
}: AutomationsTriggersTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: TRIGGERS_PAGE_SIZE,
  });

  const { triggers, totalCount, isTriggersLoading, isTriggersError } =
    useAutomationsTriggers({
      workspaceId,
      period,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    });

  const { isAdmin } = useAuth();
  const confirm = useContext(ConfirmContext);
  const updateTriggerStatus = useUpdateTriggerStatus({ workspaceId });

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
          message: isAdmin
            ? `"${trigger.name}" will stop running for ${trigger.editor.name}. Only an admin will be able to re-enable it.`
            : `"${trigger.name}" will stop running for ${trigger.editor.name}.`,
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
        // An admin's disable is stored server-side as disabled_by_admin; a
        // manager disabling their own automation stays a plain disabled.
        setStatusOverrides((overrides) => ({
          ...overrides,
          [trigger.triggerId]:
            nextStatus === "disabled"
              ? isAdmin
                ? "disabled_by_admin"
                : "disabled"
              : "enabled",
        }));
      }
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(trigger.triggerId);
        return next;
      });
    },
    [confirm, isAdmin, updateTriggerStatus]
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
        };
      }),
    [triggers, statusOverrides, pendingIds, handleToggle]
  );

  return (
    <div className="rounded-lg border border-border bg-panel-background p-4">
      <TriggersTableBody
        isLoading={isTriggersLoading}
        isError={!!isTriggersError}
        rows={rows}
        totalCount={totalCount}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}

interface TriggersTableBodyProps {
  isLoading: boolean;
  isError: boolean;
  rows: TriggerRowData[];
  totalCount: number;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
}

function TriggersTableBody({
  isLoading,
  isError,
  rows,
  totalCount,
  pagination,
  setPagination,
}: TriggersTableBodyProps) {
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
        No automation ran over this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <DataTable<TriggerRowData>
        className="min-w-200"
        data={rows}
        columns={columns}
        totalRowCount={totalCount}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}
