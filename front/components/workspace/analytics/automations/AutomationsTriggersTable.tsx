import { getIcon } from "@app/components/resources/resources_icons";
import {
  AvatarNameCell,
  CreditsCell,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useAutomationsTriggers } from "@app/hooks/useAutomationsTriggers";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Clock,
  DataTable,
  DataTableLoadingSkeleton,
  Icon,
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
      return <TypeLabel visual={Clock} label="Schedule" />;
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

const columns: ColumnDef<TriggerRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    meta: { headerAlign: "left" },
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
    meta: { headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start">
        <AvatarNameCell
          name={info.row.original.agent.name}
          imageUrl={info.row.original.agent.pictureUrl}
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "editor",
    header: "Members",
    enableSorting: false,
    meta: { headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start">
        <AvatarNameCell
          name={info.row.original.editor.name}
          imageUrl={info.row.original.editor.pictureUrl}
          isRounded
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "type",
    header: "Type",
    enableSorting: false,
    meta: { className: "w-40", headerAlign: "left" },
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
    meta: { className: "w-24", headerAlign: "right" },
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
    meta: { className: "w-28", headerAlign: "right" },
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
        className="min-w-150"
        data={triggers}
        columns={columns}
        totalRowCount={totalCount}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}
