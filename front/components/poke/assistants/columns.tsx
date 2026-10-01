import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import config from "@app/lib/api/config";
import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeAgentConfigurationType } from "@app/types/api/poke/agent_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Download01,
  FaceSmile,
  LinkWrapper,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

export function makeColumnsForAssistants(
  owner: LightWorkspaceType,
  agentsRetention: Record<string, number>,
  onAgentArchivedOrRestored: () => Promise<void>
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
        return retention ? `${retention} days` : <XClose className="h-4 w-4" />;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const assistant = row.original;

        return (
          <PokeAgentActions
            owner={owner}
            assistant={assistant}
            onRefresh={onAgentArchivedOrRestored}
          />
        );
      },
    },
  ];
}

interface PokeAgentActionsProps {
  owner: LightWorkspaceType;
  assistant: Pick<
    PokeAgentConfigurationType,
    "sId" | "name" | "scope" | "status"
  >;
  onRefresh: () => Promise<void>;
}

/**
 * @cc [owner:aubin-tchoi,label:product;react] poke-actions-preserve-navigation
 * Archive, restore and export clicks MUST NOT trigger the table row's detail navigation.
 */
export function PokeAgentActions({
  owner,
  assistant,
  onRefresh,
}: PokeAgentActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  if (assistant.scope === "global") {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Button
        icon={assistant.status !== "archived" ? Trash01 : FaceSmile}
        size="xs"
        variant="outline"
        tooltip={
          assistant.status !== "archived" ? "Archive agent" : "Restore agent"
        }
        isLoading={isUpdating}
        onClick={async () => {
          setIsUpdating(true);
          try {
            await (assistant.status !== "archived"
              ? archiveAssistant(owner, onRefresh, assistant)
              : restoreAssistant(owner, onRefresh, assistant));
          } finally {
            setIsUpdating(false);
          }
        }}
      />
      <a
        href={`${config.getApiBaseUrl()}/api/poke/workspaces/${owner.sId}/agent_configurations/${assistant.sId}/export`}
        download={`${assistant.name}.json`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button
          icon={Download01}
          size="xs"
          variant="outline"
          tooltip="Export agent"
        />
      </a>
    </div>
  );
}

async function archiveAssistant(
  owner: LightWorkspaceType,
  onAgentArchived: () => Promise<void>,
  agentConfiguration: Pick<PokeAgentConfigurationType, "sId" | "name">
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
  agentConfiguration: Pick<PokeAgentConfigurationType, "sId" | "name">
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
