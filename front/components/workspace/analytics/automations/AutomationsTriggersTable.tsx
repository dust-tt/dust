import { getIcon } from "@app/components/resources/resources_icons";
import {
  AvatarNameCell,
  CreditsCell,
  EntityTooltipCard,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useAutomationsTriggers } from "@app/hooks/useAutomationsTriggers";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Avatar,
  Clock,
  DataTable,
  DataTableLoadingSkeleton,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useState } from "react";

const TRIGGERS_PAGE_SIZE = 25;

interface TriggerRowData extends AutomationTriggerRow {
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

  return (
    <div className="rounded-lg border border-border bg-panel-background p-4">
      <TriggersTableBody
        isLoading={isTriggersLoading}
        isError={!!isTriggersError}
        triggers={triggers}
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
  triggers: AutomationTriggerRow[];
  totalCount: number;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
}

function TriggersTableBody({
  isLoading,
  isError,
  triggers,
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

  if (triggers.length === 0) {
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
        data={triggers}
        columns={columns}
        totalRowCount={totalCount}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}
