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
  onClick,
}: {
  text: string | null;
  maxLength: number;
  onClick: () => void;
}) {
  const truncated = truncate(text, maxLength);
  const isTruncated = text && text.length > maxLength;
  return (
    <span
      onClick={isTruncated ? onClick : undefined}
      className={isTruncated ? "cursor-pointer hover:underline" : ""}
      title={isTruncated ? "Click to see full content" : undefined}
    >
      {truncated}
    </span>
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
  onSuggestionDeleted: () => Promise<void>,
  onSuggestionClick: (suggestion: SkillSuggestionType) => void
): ColumnDef<SkillSuggestionType>[] {
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
      accessorKey: "analysis",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Analysis" />
      ),
      cell: ({ row }) => {
        return (
          <ClickableCell
            text={row.original.analysis}
            maxLength={MAX_ANALYSIS_LENGTH}
            onClick={() => onSuggestionClick(row.original)}
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
      id: "content",
      header: "Content",
      cell: ({ row }) => {
        const content = JSON.stringify(row.original.suggestion);
        return (
          <ClickableCell
            text={content}
            maxLength={MAX_CONTENT_LENGTH}
            onClick={() => onSuggestionClick(row.original)}
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
