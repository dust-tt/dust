import { getIcon } from "@app/components/resources/resources_icons";
import type { TriggerRowData } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import {
  EXECUTION_MODE_UNAVAILABLE_MESSAGES,
  POOL_OPTIONS,
} from "@app/components/workspace/analytics/automations/trigger_pool_options";
import {
  AvatarNameCell,
  CreditsCell,
  EntityTooltipCard,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useTriggerExecutionModes } from "@app/hooks/useTriggerExecutionModes";
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
  cn,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const webhookSourceName = trigger.webhookSourceName;
  switch (trigger.kind) {
    case "schedule":
      return (
        <TypeLabel
          visual={Clock}
          label={trigger.scheduleDescription || t`Schedule`}
        />
      );
    case "webhook":
      if (trigger.webhookSourceRestricted) {
        return (
          <TypeLabel
            visual={getIcon("ActionLockIcon")}
            label={t`This webhook lives in a space you don't have access to.`}
          />
        );
      }
      return (
        <TypeLabel
          visual={getIcon(normalizeWebhookIcon(trigger.webhookIcon))}
          label={
            webhookSourceName ? t`${webhookSourceName} webhook` : t`Webhook`
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
    header: () => <Trans>Name</Trans>,
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
  onClick?: () => void;
}

/**
 * @cc [owner:aubin-tchoi,label:product] agent-click-does-not-expand-row
 * When onClick is provided, activating the agent must invoke it without activating the table row.
 */
function AgentCell({ agent, onClick }: AgentCellProps) {
  const content = (
    <div className="min-w-0">
      <AvatarNameCell
        name={agent.name}
        imageUrl={agent.pictureUrl}
        size="xxs"
      />
    </div>
  );

  const interactiveContent = onClick ? (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 min-w-11 max-w-full cursor-pointer items-center rounded-sm text-left",
        "outline-hidden ring-offset-background",
        "pointer-fine:hover:underline",
        "focus-visible:ring-2 focus-visible:ring-highlight-300 focus-visible:ring-offset-1"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {content}
    </button>
  ) : (
    content
  );

  if (!agent.description) {
    return interactiveContent;
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
      trigger={interactiveContent}
    />
  );
}

export function agentColumn<T extends TriggerRowData>(): ColumnDef<T> {
  return {
    id: "agent",
    header: () => <Trans>Agent</Trans>,
    enableSorting: false,
    meta: { className: "w-44", headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start">
        <AgentCell
          agent={info.row.original.agent}
          onClick={info.row.original.onAgentClick}
        />
      </DataTable.CellContent>
    ),
  };
}

export function typeColumn<T extends TriggerRowData>(): ColumnDef<T> {
  return {
    id: "type",
    header: () => <Trans>Type</Trans>,
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
    header: () => <Trans>Credits</Trans>,
    meta: { className: "w-24", headerAlign: "right" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-end text-right">
        <CreditsCell credits={info.row.original.credits} />
      </DataTable.CellContent>
    ),
  };
}

interface DetailsButtonProps {
  row: TriggerRowData;
  isExpanded: boolean;
}

function DetailsButton({ row, isExpanded }: DetailsButtonProps) {
  const { t } = useLingui();
  const name = row.name;
  return (
    <Button
      icon={isExpanded ? ChevronUp : ChevronDown}
      variant="ghost-secondary"
      size="xs"
      aria-label={
        isExpanded
          ? t`Collapse breakdown for ${name}`
          : t`Expand breakdown for ${name}`
      }
      aria-expanded={isExpanded}
      onClick={(event) => {
        event.stopPropagation();
        row.onClick();
      }}
    />
  );
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
      return (
        <DataTable.CellContent className="w-full justify-end">
          <DetailsButton
            row={row}
            isExpanded={expandedRowId === row.triggerId}
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

interface PoolCellProps {
  row: TriggerRowData & PoolRowFields;
}

function PoolCell({ row }: PoolCellProps) {
  const { t } = useLingui();
  const { hasPermission } = useWorkspacePermissions();
  const { canUseExecutionMode } = useTriggerExecutionModes();
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
          label={isWorkspacePool ? t`Workspace` : t`Member`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {POOL_OPTIONS.map(({ value, label }) => (
          <DropdownMenuItem
            key={value}
            label={t(label)}
            disabled={!canUseExecutionMode(value)}
            tooltip={
              canUseExecutionMode(value)
                ? undefined
                : t(EXECUTION_MODE_UNAVAILABLE_MESSAGES[value])
            }
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
    header: () => <Trans>Pool</Trans>,
    enableSorting: false,
    meta: { className: "w-32" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start">
        <PoolCell row={info.row.original} />
      </DataTable.CellContent>
    ),
  };
}
