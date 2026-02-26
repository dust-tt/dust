import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import config from "@app/lib/api/config";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeAgentConfigurationType } from "@app/pages/api/poke/workspaces/[wId]/agent_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ArrowDownOnSquareIcon,
  EmotionLaughIcon,
  IconButton,
  LinkWrapper,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForAssistants(
  owner: LightWorkspaceType,
  agentsRetention: Record<string, number>,
  onAgentArchivedOrRestored: () => Promise<void>,
  fetcherFn: (url: string, init?: RequestInit) => Promise<any>
): ColumnDef<PokeAgentConfigurationType>[] {
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
      accessorKey: "scope",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Scope" />
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      accessorKey: "versionCreatedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
      cell: ({ row }) => {
        const createdAt: string | null = row.getValue("versionCreatedAt");

        if (!createdAt) {
          return;
        }

        return formatTimestampToFriendlyDate(new Date(createdAt).getTime());
      },
    },
    {
      id: "author",
      accessorFn: (row) => {
        const author = row.versionAuthor;
        if (author) {
          return author.email;
        }
        return row.versionAuthorId?.toString() ?? "";
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Author" />
      ),
      cell: ({ row }) => {
        const author = row.original.versionAuthor;
        if (author) {
          return author.email;
        }
        return row.original.versionAuthorId?.toString() ?? "-";
      },
    },
    {
      accessorKey: "retention",
      header: ({ column }) => (
        <PokeColumnSortableHeader
          column={column}
          label="Conversation retention"
        />
      ),
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
                      assistant,
                      fetcherFn
                    )
                  : restoreAssistant(
                      owner,
                      onAgentArchivedOrRestored,
                      assistant,
                      fetcherFn
                    ));
              }}
            />
            <a
              href={`${config.getApiBaseUrl()}/api/poke/workspaces/${owner.sId}/agent_configurations/${assistant.sId}/export`}
              download={`${assistant.name}.json`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconButton
                icon={ArrowDownOnSquareIcon}
                size="xs"
                variant="outline"
              />
            </a>
          </>
        );
      },
    },
  ];
}

async function archiveAssistant(
  owner: LightWorkspaceType,
  onAgentArchived: () => Promise<void>,
  agentConfiguration: PokeAgentConfigurationType,
  fetcherFn: (url: string, init?: RequestInit) => Promise<any>
) {
  if (
    !window.confirm(
      `Are you sure you want to archive the ${agentConfiguration.name} assistant?`
    )
  ) {
    return;
  }

  try {
    await fetcherFn(
      `/api/poke/workspaces/${owner.sId}/agent_configurations/${agentConfiguration.sId}`,
      {
        method: "DELETE",
      }
    );

    await onAgentArchived();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while archiving the agent configuration.");
  }
}

async function restoreAssistant(
  owner: LightWorkspaceType,
  onAgentRestored: () => Promise<void>,
  agentConfiguration: PokeAgentConfigurationType,
  fetcherFn: (url: string, init?: RequestInit) => Promise<any>
) {
  if (
    !window.confirm(
      `Are you sure you want to restore the ${agentConfiguration.name} assistant?`
    )
  ) {
    return;
  }

  try {
    await fetcherFn(
      `/api/poke/workspaces/${owner.sId}/agent_configurations/${agentConfiguration.sId}/restore`,
      {
        method: "POST",
      }
    );

    await onAgentRestored();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while restoring the agent configuration.");
  }
}
