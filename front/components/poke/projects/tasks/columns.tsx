import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { ProjectTaskType } from "@app/types/project_task";
import type { WorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function statusChip(task: ProjectTaskType) {
  switch (task.status) {
    case "todo":
      return <Chip color="info" label="todo" size="xs" />;
    case "in_progress":
      return <Chip color="warning" label="in progress" size="xs" />;
    case "done":
      return <Chip color="success" label="done" size="xs" />;
  }
}

export function makeColumnsForProjectTasks(
  owner: WorkspaceType
): ColumnDef<ProjectTaskType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => <span className="font-mono">{row.original.sId}</span>,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "status",
      cell: ({ row }) => statusChip(row.original),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      accessorKey: "text",
      cell: ({ row }) => (
        <Tooltip
          label={row.original.text}
          trigger={
            <span className="line-clamp-2 max-w-md">{row.original.text}</span>
          }
        />
      ),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Text" />
      ),
    },
    {
      id: "assignedTo",
      cell: ({ row }) => row.original.user?.fullName,
      header: () => <span>Assigned to</span>,
    },
    {
      accessorKey: "agentSuggestionStatus",
      cell: ({ row }) => row.original.agentSuggestionStatus ?? "—",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Suggestion" />
      ),
    },
    {
      accessorKey: "conversationId",
      cell: ({ row }) =>
        row.original.conversationId ? (
          <LinkWrapper
            href={`/poke/${owner.sId}/conversation/${row.original.conversationId}`}
          >
            {row.original.conversationId}
          </LinkWrapper>
        ) : (
          "—"
        ),
      header: () => <span>Conversation</span>,
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) =>
        formatTimestampToFriendlyDate(
          new Date(row.original.createdAt).getTime()
        ),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
    },
    {
      accessorKey: "doneAt",
      cell: ({ row }) =>
        row.original.doneAt
          ? formatTimestampToFriendlyDate(
              new Date(row.original.doneAt).getTime()
            )
          : "—",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Done at" />
      ),
    },
  ];
}
