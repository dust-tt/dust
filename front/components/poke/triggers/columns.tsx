import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { TriggerWithProviderType } from "@app/pages/api/poke/workspaces/[wId]/triggers";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, IconButton, LinkWrapper, TrashIcon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

type TriggerDisplayType = TriggerWithProviderType;

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
          return `${trigger.configuration.cron} (${trigger.configuration.timezone})`;
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
      accessorKey: "enabled",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Enabled" />
      ),
      cell: ({ row }) => {
        return row.getValue("enabled") ? "Yes" : "No";
      },
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
            icon={TrashIcon}
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

async function deleteTrigger(
  owner: LightWorkspaceType,
  onTriggerDeleted: () => Promise<void>,
  trigger: TriggerType
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
