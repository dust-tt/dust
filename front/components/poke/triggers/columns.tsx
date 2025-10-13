import { IconButton, LinkWrapper, TrashIcon } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

type TriggerDisplayType = TriggerType & {
  agentName?: string;
};

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
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Name</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      id: "agentName",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Agent Name</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      accessorFn: (row) => {
        const agent = agentConfigMap.get(row.agentConfigurationId);
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return agent?.name || row.agentConfigurationId;
      },
    },
    {
      accessorKey: "kind",
      header: "Kind",
    },
    {
      accessorKey: "configuration",
      header: "Configuration",
      cell: ({ row }) => {
        const trigger = row.original;
        if (trigger.kind === "schedule") {
          return `${trigger.configuration.cron} (${trigger.configuration.timezone})`;
        }
        return JSON.stringify(trigger.configuration);
      },
    },
    {
      accessorKey: "enabled",
      header: "Enabled",
      cell: ({ row }) => {
        return row.getValue("enabled") ? "Yes" : "No";
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Created At</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
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
    const r = await fetch(
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
