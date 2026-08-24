import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { formatCredits } from "@app/lib/client/credits";
import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeAgentTriggerRow } from "@app/types/api/poke/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, IconButton, LinkWrapper, Trash01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function ConsumptionCell({ trigger }: { trigger: AutomationTriggerRow }) {
  const { credits, runCount } = trigger;
  const creditsLabel = `${formatCredits(credits)} credits`;
  const runUnit = runCount === 1 ? "run" : "runs";
  const creditsPerRun =
    runCount > 0 ? `${formatCredits(credits / runCount)} credits/run` : "—";
  const estimatesLabel = `Est. ${runCount.toLocaleString("en-US")} ${runUnit} · ${creditsPerRun}`;

  return (
    <div className="flex min-h-10 w-52 flex-col justify-center overflow-hidden whitespace-nowrap tabular-nums">
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

export function makeColumnsForTriggers(
  owner: LightWorkspaceType,
  onTriggerDeleted: () => Promise<void>
): ColumnDef<PokeAgentTriggerRow>[] {
  return [
    {
      accessorKey: "triggerId",
      cell: ({ row }) => {
        const trigger = row.original;
        if (!trigger.agent.isAvailable) {
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
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
    },
    {
      id: "agentName",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Agent name" />
      ),
      accessorFn: (row) => row.agent.name,
    },
    {
      accessorKey: "kind",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Kind" />
      ),
    },
    {
      accessorKey: "origin",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Origin" />
      ),
      cell: ({ row }) => {
        const trigger = row.original;
        return (
          <Chip
            color={trigger.origin === "agent" ? "info" : "primary"}
            size="xs"
          >
            {trigger.origin}
          </Chip>
        );
      },
    },
    {
      id: "provider",
      accessorFn: (trigger) => {
        if (trigger.kind === "webhook") {
          return trigger.provider ?? "Custom";
        }
        return "-";
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Provider" />
      ),
      cell: ({ row }) => {
        const trigger = row.original;
        if (trigger.kind === "webhook") {
          return trigger.provider ?? "Custom";
        }
        return "-";
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "configurationSummary",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Configuration" />
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      id: "editorEmail",
      accessorFn: (row) => row.editor?.email ?? row.editor?.name ?? "",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Editor" />
      ),
      cell: ({ row }) => {
        const trigger = row.original;
        return trigger.editor?.email ?? trigger.editor?.name ?? "-";
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
      cell: ({ row }) => {
        const trigger = row.original;
        return formatTimestampToFriendlyDate(trigger.createdAt);
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const trigger = row.original;

        return (
          <IconButton
            aria-label={`Delete trigger ${trigger.name}`}
            icon={Trash01}
            size="xs"
            variant="outline"
            onClick={async () => {
              await deleteTrigger(owner, onTriggerDeleted, trigger);
            }}
          />
        );
      },
    },
  ];
}

export function makeColumnsForAutomationTriggers(
  owner: LightWorkspaceType,
  onTriggerDeleted: () => Promise<void>
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
      cell: ({ row }) => (
        <IconButton
          aria-label={`Delete trigger ${row.original.name}`}
          icon={Trash01}
          size="xs"
          variant="outline"
          onClick={async () => {
            await deleteTrigger(owner, onTriggerDeleted, {
              name: row.original.name,
              triggerId: row.original.triggerId,
            });
          }}
        />
      ),
    },
  ];
}

async function deleteTrigger(
  owner: LightWorkspaceType,
  onTriggerDeleted: () => Promise<void>,
  trigger: { name: string; triggerId: string }
) {
  if (
    !window.confirm(
      `Are you sure you want to delete the trigger "${trigger.name}"?`
    )
  ) {
    return;
  }

  try {
    const r = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/triggers?tId=${trigger.triggerId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      throw new Error("Failed to delete trigger.");
    }

    await onTriggerDeleted();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while deleting the trigger.");
  }
}
