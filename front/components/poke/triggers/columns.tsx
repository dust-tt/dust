import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { TriggerStatusChip } from "@app/components/triggers/TriggerStatusChip";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { formatCredits } from "@app/lib/client/credits";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

interface DisableTriggerButtonProps {
  triggerId: string;
  triggerName: string;
  onDisable: (triggerId: string) => Promise<void>;
}

function DisableTriggerButton({
  triggerId,
  triggerName,
  onDisable,
}: DisableTriggerButtonProps) {
  const [isDisabling, setIsDisabling] = useState(false);

  const handleDisable = async () => {
    if (
      !window.confirm(
        `Disable trigger "${triggerName}"? It will stop running but remain available for a manager or admin to re-enable.`
      )
    ) {
      return;
    }

    setIsDisabling(true);
    try {
      await onDisable(triggerId);
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <Button
      label="Disable"
      size="xs"
      variant="outline"
      isLoading={isDisabling}
      onClick={handleDisable}
    />
  );
}

function ConsumptionCell({ trigger }: { trigger: AutomationTriggerRow }) {
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
  owner: LightWorkspaceType,
  onTriggerDisable: (triggerId: string) => Promise<void>
): ColumnDef<AutomationTriggerRow>[] {
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
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => <TriggerStatusChip status={row.original.status} />,
    },
    {
      id: "editor",
      header: "Editor",
      enableSorting: false,
      accessorFn: (trigger) => trigger.editor.email ?? trigger.editor.name,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const trigger = row.original;
        if (trigger.status !== "enabled") {
          return null;
        }

        return (
          <DisableTriggerButton
            triggerId={trigger.triggerId}
            triggerName={trigger.name}
            onDisable={onTriggerDisable}
          />
        );
      },
    },
  ];
}
