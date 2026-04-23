import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { clientFetch } from "@app/lib/egress/client";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, IconButton, TrashIcon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

const MAX_ANALYSIS_LENGTH = 80;
const MAX_CONTENT_LENGTH = 80;

function truncate(text: string | null, maxLength: number): string {
  if (!text) {
    return "-";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "...";
}

function ClickableCell({
  text,
  maxLength,
  href,
}: {
  text: string | null;
  maxLength: number;
  href: string;
}) {
  const truncated = truncate(text, maxLength);
  const isTruncated = text && text.length > maxLength;
  if (!isTruncated) {
    return <span>{truncated}</span>;
  }
  return (
    <a
      href={href}
      className="cursor-pointer hover:underline"
      title="Click to see full content"
    >
      {truncated}
    </a>
  );
}

async function deleteSuggestion(
  owner: LightWorkspaceType,
  skillId: string,
  suggestion: SkillSuggestionType,
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
      `/api/poke/workspaces/${owner.sId}/skills/${skillId}/suggestions?suggestionSId=${suggestion.sId}`,
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

export function makeColumnsForSkillSuggestions(
  owner: LightWorkspaceType,
  skillId: string,
  onSuggestionDeleted: () => Promise<void>
): ColumnDef<SkillSuggestionType>[] {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
      cell: ({ row }) => {
        return (
          <a
            href={`/${owner.sId}/suggestions/${row.original.sId}`}
            className="text-action-500 hover:underline"
          >
            {row.original.sId}
          </a>
        );
      },
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
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "sourceConversationId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Conversation" />
      ),
      cell: ({ row }) => {
        const conversationId = row.original.sourceConversationId;
        if (!conversationId) {
          return "-";
        }
        return (
          <a
            href={`/${owner.sId}/conversation/${conversationId}`}
            className="text-action-500 hover:underline"
          >
            {conversationId}
          </a>
        );
      },
    },
    {
      accessorKey: "sourceConversationsCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader
          column={column}
          label="Source Conversations"
        />
      ),
      cell: ({ row }) => {
        return row.original.sourceConversationsCount;
      },
    },
    {
      accessorKey: "analysis",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Analysis" />
      ),
      cell: ({ row }) => {
        return (
          <ClickableCell
            text={row.original.analysis}
            maxLength={MAX_ANALYSIS_LENGTH}
            href={`/${owner.sId}/suggestions/${row.original.sId}`}
          />
        );
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
      accessorKey: "updatedBy",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Updated by" />
      ),
      cell: ({ row }) => {
        const updatedBy = row.original.updatedBy;
        if (!updatedBy) {
          return "-";
        }
        return <span title={updatedBy.email}>{updatedBy.fullName}</span>;
      },
    },
    {
      id: "content",
      header: "Content",
      cell: ({ row }) => {
        const content = JSON.stringify(row.original.suggestion);
        return (
          <ClickableCell
            text={content}
            maxLength={MAX_CONTENT_LENGTH}
            href={`/${owner.sId}/suggestions/${row.original.sId}`}
          />
        );
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
                skillId,
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
