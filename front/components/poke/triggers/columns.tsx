import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type {
  PokeTriggerConsumptionStats,
  PokeTriggerSearchRow,
  TriggerWithProviderType,
} from "@app/lib/api/poke/triggers";
import { formatCredits } from "@app/lib/client/credits";
import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, IconButton, LinkWrapper, Trash01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

type TriggerDisplayType = TriggerWithProviderType | PokeTriggerSearchRow;

function isPokeTriggerSearchRow(
  trigger: TriggerDisplayType
): trigger is PokeTriggerSearchRow {
  return "agentName" in trigger;
}

interface ConsumptionCellProps {
  consumption: PokeTriggerConsumptionStats | null;
}

function ConsumptionCell({ consumption }: ConsumptionCellProps) {
  if (consumption === null) {
    return (
      <div className="flex min-h-10 w-52 items-center whitespace-nowrap">
        <span className="text-sm text-muted-foreground">Unavailable</span>
      </div>
    );
  }

  const { credits, estimatedRunCount, estimatedCreditsPerRun } = consumption;

  const creditsLabel = `${formatCredits(credits)} credits`;
  const estimatesLabel = (() => {
    if (estimatedRunCount === null) {
      return "Run estimate unavailable";
    }

    const runUnit = estimatedRunCount === 1 ? "run" : "runs";
    const creditsPerRun =
      estimatedCreditsPerRun === null
        ? "— credits/run"
        : `${formatCredits(estimatedCreditsPerRun)} credits/run`;
    return `Est. ${estimatedRunCount.toLocaleString("en-US")} ${runUnit} · ${creditsPerRun}`;
  })();

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
  agentConfigurations: LightAgentConfigurationType[],
  onTriggerDeleted: () => Promise<void>,
  options?: { disableActions?: boolean; includeConsumption?: boolean }
): ColumnDef<TriggerDisplayType>[] {
  const agentConfigMap = new Map(
    agentConfigurations.map((agent) => [agent.sId, agent])
  );

  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const trigger = row.original;
        const agent = agentConfigMap.get(trigger.agentConfigurationId);
        const hasResolvedAgent = isPokeTriggerSearchRow(trigger)
          ? trigger.agentName !== null
          : agent !== undefined;

        if (!hasResolvedAgent) {
          return trigger.sId;
        }

        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/assistants/${trigger.agentConfigurationId}/triggers/${trigger.sId}`}
          >
            {trigger.sId}
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
      accessorFn: (row) => {
        const agent = agentConfigMap.get(row.agentConfigurationId);
        return isPokeTriggerSearchRow(row)
          ? (row.agentName ?? row.agentConfigurationId)
          : (agent?.name ?? row.agentConfigurationId);
      },
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
      accessorFn: (row) => {
        if (row.kind !== "webhook") {
          return "-";
        }
        return row.provider ?? "custom";
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
      accessorKey: "configuration",
      enableSorting: false,
      header: "Configuration",
      cell: ({ row }) => {
        const trigger = row.original;
        if (isPokeTriggerSearchRow(trigger)) {
          return trigger.configurationDescription;
        }
        if (trigger.kind === "schedule") {
          return `${describeScheduleConfig(trigger.configuration)} (${trigger.configuration.timezone})`;
        }
        // Webhook: show event + filter summary
        const parts: string[] = [];
        if (trigger.configuration.event) {
          parts.push(trigger.configuration.event);
        }
        if (trigger.configuration.filter) {
          parts.push("+ filter");
        }
        if (trigger.configuration.includePayload) {
          parts.push("w/ payload");
        }
        return parts.length > 0 ? parts.join(" ") : "All events";
      },
    },
    ...(options?.includeConsumption
      ? [
          {
            id: "consumption",
            accessorFn: (row) =>
              isPokeTriggerSearchRow(row) ? (row.consumption?.credits ?? 0) : 0,
            header: ({ column }) => (
              <PokeColumnSortableHeader column={column} label="Consumption" />
            ),
            cell: ({ row }) => (
              <ConsumptionCell
                consumption={
                  isPokeTriggerSearchRow(row.original)
                    ? row.original.consumption
                    : null
                }
              />
            ),
          } satisfies ColumnDef<TriggerDisplayType>,
        ]
      : []),
    {
      accessorKey: "status",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      id: "editorEmail",
      accessorFn: (row) => {
        if (isPokeTriggerSearchRow(row)) {
          return row.editorEmail ?? "";
        }
        if (row.editorUser) {
          return row.editorUser.email;
        }
        return row.editor?.toString() ?? "";
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Editor" />
      ),
      cell: ({ row }) => {
        const trigger = row.original;
        if (isPokeTriggerSearchRow(trigger)) {
          return trigger.editorEmail ?? "-";
        }
        if (trigger.editorUser) {
          return `${trigger.editorUser.email}`;
        }
        return trigger.editor?.toString() ?? "-";
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
            disabled={options?.disableActions}
            onClick={async () => {
              await deleteTrigger(owner, onTriggerDeleted, trigger);
            }}
          />
        );
      },
    },
  ];
}

async function deleteTrigger(
  owner: LightWorkspaceType,
  onTriggerDeleted: () => Promise<void>,
  trigger: Pick<TriggerDisplayType, "name" | "sId">
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
      `/api/poke/workspaces/${owner.sId}/triggers?tId=${trigger.sId}`,
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
