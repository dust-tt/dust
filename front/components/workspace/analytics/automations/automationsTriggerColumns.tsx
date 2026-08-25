import { getIcon } from "@app/components/resources/resources_icons";
import type { TriggerRowData } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import { POOL_OPTIONS } from "@app/components/workspace/analytics/automations/trigger_pool_options";
import {
  AvatarNameCell,
  CreditsCell,
  EntityTooltipCard,
} from "@app/components/workspace/analytics/creditsTableCells";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Avatar,
  Button,
  ChevronDown,
  ChevronUp,
  Clock,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import type { ComponentType } from "react";

interface TypeLabelProps {
  visual: ComponentType<{ className?: string }>;
  label: string;
}

function TypeLabel({ visual, label }: TypeLabelProps) {
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

interface TypeCellProps {
  trigger: AutomationTriggerRow;
}

export function TypeCell({ trigger }: TypeCellProps) {
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

export function nameColumn<T extends TriggerRowData>(): ColumnDef<T> {
  return {
    id: "name",
    accessorKey: "name",
    header: "Name",
    enableSorting: false,
    meta: { className: "truncate", headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start text-left">
        <span className="truncate text-sm font-semibold">
          {info.row.original.name}
        </span>
      </DataTable.CellContent>
    ),
  };
}

interface AgentCellProps {
  agent: AutomationTriggerRow["agent"];
}

function AgentCell({ agent }: AgentCellProps) {
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

export function agentColumn<T extends TriggerRowData>(): ColumnDef<T> {
  return {
    id: "agent",
    header: "Agent",
    enableSorting: false,
    meta: { className: "w-44", headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start">
        <AgentCell agent={info.row.original.agent} />
      </DataTable.CellContent>
    ),
  };
}

export function typeColumn<T extends TriggerRowData>(): ColumnDef<T> {
  return {
    id: "type",
    header: "Type",
    enableSorting: false,
    meta: { className: "w-8", headerAlign: "center" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-center">
        <TypeCell trigger={info.row.original} />
      </DataTable.CellContent>
    ),
  };
}

export function creditsColumn<T extends TriggerRowData>(): ColumnDef<T> {
  return {
    id: "credits",
    accessorKey: "credits",
    header: "Credits",
    meta: { className: "w-24", headerAlign: "right" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-end text-right">
        <CreditsCell credits={info.row.original.credits} />
      </DataTable.CellContent>
    ),
  };
}

export function detailsColumn<T extends TriggerRowData>(
  expandedRowId: string | null
): ColumnDef<T> {
  return {
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
  };
}

export interface PoolRowFields {
  displayExecutionMode: TriggerExecutionMode;
  isExecutionModePending: boolean;
  onSetExecutionMode: (executionMode: TriggerExecutionMode) => void;
}

function PoolCell({ row }: { row: TriggerRowData & PoolRowFields }) {
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

export function poolColumn<
  T extends TriggerRowData & PoolRowFields,
>(): ColumnDef<T> {
  return {
    id: "pool",
    header: "Pool",
    enableSorting: false,
    meta: { className: "w-28" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start">
        <PoolCell row={info.row.original} />
      </DataTable.CellContent>
    ),
  };
}
