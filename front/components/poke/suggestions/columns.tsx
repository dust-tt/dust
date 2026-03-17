import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, IconButton, TrashIcon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

const MAX_ANALYSIS_LENGTH = 80;

function truncate(text: string | null, maxLength: number): string {
  if (!text) {
    return "-";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "...";
}

async function deleteSuggestion(
  owner: LightWorkspaceType,
  agentId: string,
  suggestion: AgentSuggestionType,
  onSuggestionDeleted: () => Promise<void>
) {
  if (
    !window.confirm(
      `Are you sure you want to delete suggestion "${suggestion.sId}"?`
    )
  ) {
    return;
  }

  try {
    const r = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/assistants/${agentId}/suggestions?sId=${suggestion.sId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      throw new Error("Failed to delete suggestion.");
    }
    await onSuggestionDeleted();
  } catch (_e) {
    window.alert("An error occurred while deleting the suggestion.");
  }
}

export function makeColumnsForSuggestions(
  owner: LightWorkspaceType,
  agentId: string,
  onSuggestionDeleted: () => Promise<void>
): ColumnDef<AgentSuggestionType>[] {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "kind",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Kind" />
      ),
      cell: ({ row }) => {
        return (
          <Chip color="info" size="xs">
            {row.original.kind}
          </Chip>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "state",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="State" />
      ),
      cell: ({ row }) => {
        const state = row.original.state;
        const colorMap: Record<
          string,
          "info" | "primary" | "warning" | "rose"
        > = {
          pending: "warning",
          approved: "primary",
          rejected: "rose",
          outdated: "info",
        };
        return (
          <Chip color={colorMap[state] ?? "info"} size="xs">
            {state}
          </Chip>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "source",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Source" />
      ),
    },
    {
      accessorKey: "analysis",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Analysis" />
      ),
      cell: ({ row }) => {
        return truncate(row.original.analysis, MAX_ANALYSIS_LENGTH);
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
      cell: ({ row }) => {
        return formatTimestampToFriendlyDate(row.original.createdAt);
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Updated at" />
      ),
      cell: ({ row }) => {
        return formatTimestampToFriendlyDate(row.original.updatedAt);
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const suggestion = row.original;
        return (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="outline"
            onClick={async () => {
              await deleteSuggestion(
                owner,
                agentId,
                suggestion,
                onSuggestionDeleted
              );
            }}
          />
        );
      },
    },
  ];
}
