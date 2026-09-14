import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { formatCredits } from "@app/lib/client/credits";
import type { TriggerStatus } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { LinkWrapper, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export interface PokeTriggerTableRow extends AutomationTriggerRow {
  displayStatus: TriggerStatus;
  isStatusPending: boolean;
  onToggleStatus: () => void;
}

interface LockedStatusToggleProps {
  label: string;
}

function LockedStatusToggle({ label }: LockedStatusToggleProps) {
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

interface TriggerStatusControlProps {
  row: PokeTriggerTableRow;
}

function TriggerStatusControl({ row }: TriggerStatusControlProps) {
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
      return (
        <LockedStatusToggle label="Disabled while the workspace is being relocated." />
      );
    case "downgraded":
      return (
        <LockedStatusToggle label="Disabled following a plan downgrade." />
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

interface ConsumptionCellProps {
  trigger: AutomationTriggerRow;
}

function ConsumptionCell({ trigger }: ConsumptionCellProps) {
  const { credits, runCount } = trigger;
  const creditsLabel = `${formatCredits(credits)} credits`;
  const runUnit = runCount === 1 ? "run" : "runs";
  const creditsPerRun =
    runCount > 0 ? `${formatCredits(credits / runCount)} credits/run` : "—";
  const estimatesLabel = `Est. ${runCount.toLocaleString("en-US")} ${runUnit} · ${creditsPerRun}`;

  return (
    <div className="flex min-h-10 w-52 flex-col justify-center overflow-hidden whitespace-nowrap">
      <span
        className="w-full truncate text-sm font-medium"
        title={creditsLabel}
      >
        {creditsLabel}
      </span>
      <span
        className="w-full truncate text-xs text-muted-foreground"
        title={estimatesLabel}
      >
        {estimatesLabel}
      </span>
    </div>
  );
}

export function makeColumnsForAutomationTriggers(
  owner: LightWorkspaceType
): ColumnDef<PokeTriggerTableRow>[] {
  return [
    {
      accessorKey: "triggerId",
      header: "sId",
      enableSorting: false,
      cell: ({ row }) => {
        const trigger = row.original;
        if (trigger.agent.modelId === null) {
          return trigger.triggerId;
        }

        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/assistants/${trigger.agent.agentId}/triggers/${trigger.triggerId}`}
          >
            {trigger.triggerId}
          </LinkWrapper>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: false,
    },
    {
      id: "agent",
      header: "Agent",
      enableSorting: false,
      accessorFn: (trigger) => trigger.agent.name,
    },
    {
      accessorKey: "kind",
      header: "Kind",
      enableSorting: false,
    },
    {
      accessorKey: "credits",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Consumption" />
      ),
      cell: ({ row }) => <ConsumptionCell trigger={row.original} />,
    },
    {
      accessorKey: "status",
      header: "Enabled",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <TriggerStatusControl row={row.original} />
        </div>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      enableSorting: false,
      accessorFn: (trigger) => trigger.owner.email ?? trigger.owner.name,
    },
  ];
}
