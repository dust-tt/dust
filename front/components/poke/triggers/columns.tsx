import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import type { TriggerWithProviderType } from "@app/lib/api/poke/triggers";
import { formatCredits } from "@app/lib/client/credits";
import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, IconButton, LinkWrapper, Trash01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

type TriggerDisplayType = TriggerWithProviderType;

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
  agentConfigurations: LightAgentConfigurationType[],
  onTriggerDeleted: () => Promise<void>
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

        if (!agent) {
          return trigger.sId;
        }

        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/assistants/${agent.sId}/triggers/${trigger.sId}`}
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
        return agent?.name ?? row.agentConfigurationId;
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
      accessorKey: "provider",
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
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Configuration" />
      ),
      cell: ({ row }) => {
        const trigger = row.original;
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
    {
      accessorKey: "status",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      id: "editorEmail",
      accessorFn: (row) => {
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
              sId: row.original.triggerId,
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
  trigger: Pick<TriggerType, "name" | "sId">
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
