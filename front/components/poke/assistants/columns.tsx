import {
  ArrowDownOnSquareIcon,
  EmotionLaughIcon,
  IconButton,
  LinkWrapper,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types";

type AgentConfigurationDisplayType = {
  // TODO(2024-02-28 flav) Add description preview.
  // description: string;
  name: string;
  scope: string;
  sId: string;
  status: string;
  versionCreatedAt: string | null;
};

export function makeColumnsForAssistants(
  owner: LightWorkspaceType,
  agentsRetention: Record<string, number>,
  onAgentArchivedOrRestored: () => Promise<void>
): ColumnDef<AgentConfigurationDisplayType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return (
          <LinkWrapper href={`/poke/${owner.sId}/assistants/${sId}`}>
            {sId}
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
      accessorKey: "scope",
      header: "Scope",
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      accessorKey: "versionCreatedAt",
      header: "Created at",
      cell: ({ row }) => {
        const createdAt: string | null = row.getValue("versionCreatedAt");

        if (!createdAt) {
          return;
        }

        return formatTimestampToFriendlyDate(new Date(createdAt).getTime());
      },
    },
    {
      accessorKey: "retention",
      header: "Conversation retention",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");
        const retention: number = agentsRetention[sId];
        return retention ? (
          `${retention} days`
        ) : (
          <XMarkIcon className="h-4 w-4" />
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const assistant = row.original;

        return (
          <>
            <IconButton
              icon={
                assistant.status !== "archived" ? TrashIcon : EmotionLaughIcon
              }
              size="xs"
              variant="outline"
              onClick={async () => {
                await (assistant.status !== "archived"
                  ? archiveAssistant(
                      owner,
                      onAgentArchivedOrRestored,
                      assistant
                    )
                  : restoreAssistant(
                      owner,
                      onAgentArchivedOrRestored,
                      assistant
                    ));
              }}
            />
            <Link
              href={`/api/poke/workspaces/${owner.sId}/agent_configurations/${assistant.sId}/export`}
              download={`${assistant.name}.json`}
              target="_blank"
            >
              <IconButton
                icon={ArrowDownOnSquareIcon}
                size="xs"
                variant="outline"
              />
            </Link>
          </>
        );
      },
    },
  ];
}

async function archiveAssistant(
  owner: LightWorkspaceType,
  onAgentArchived: () => Promise<void>,
  agentConfiguration: AgentConfigurationDisplayType
) {
  if (
    !window.confirm(
      `Are you sure you want to archive the ${agentConfiguration.name} assistant?`
    )
  ) {
    return;
  }

  try {
    const r = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/agent_configurations/${agentConfiguration.sId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      throw new Error("Failed to archive agent configuration.");
    }

    await onAgentArchived();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while archiving the agent configuration.");
  }
}

async function restoreAssistant(
  owner: LightWorkspaceType,
  onAgentRestored: () => Promise<void>,
  agentConfiguration: AgentConfigurationDisplayType
) {
  if (
    !window.confirm(
      `Are you sure you want to restore the ${agentConfiguration.name} assistant?`
    )
  ) {
    return;
  }

  try {
    const r = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/agent_configurations/${agentConfiguration.sId}/restore`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      throw new Error("Failed to restore agent configuration.");
    }

    await onAgentRestored();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while restoring the agent configuration.");
  }
}
