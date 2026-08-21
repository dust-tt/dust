import { getIcon } from "@app/components/resources/resources_icons";
import type { TriggerRowData } from "@app/components/workspace/analytics/automations/AutomationsTriggersRowsTable";
import { CreditsCell } from "@app/components/workspace/analytics/creditsTableCells";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Button,
  ChevronDown,
  ChevronUp,
  Clock,
  DataTable,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import type { ComponentProps } from "react";

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

export function TypeCell({ trigger }: { trigger: AutomationTriggerRow }) {
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

export function typeColumn<T extends TriggerRowData>(): ColumnDef<T> {
  return {
    id: "type",
    header: "Type",
    enableSorting: false,
    meta: { className: "w-8" },
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
