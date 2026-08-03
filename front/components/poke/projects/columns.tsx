import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { PokeProjectType } from "@app/lib/api/poke/projects";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types/user";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForProjects(
  owner: WorkspaceType
): ColumnDef<PokeProjectType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => (
        <LinkWrapper href={`/poke/${owner.sId}/spaces/${row.original.sId}`}>
          {row.original.sId}
        </LinkWrapper>
      ),
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
      accessorKey: "description",
      cell: ({ row }) => row.original.description ?? "-",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Description" />
      ),
    },
    {
      accessorKey: "isRestricted",
      cell: ({ row }) => (row.original.isRestricted ? "Yes" : "No"),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Restricted" />
      ),
    },
    {
      accessorKey: "archivedAt",
      cell: ({ row }) =>
        row.original.archivedAt
          ? formatTimestampToFriendlyDate(row.original.archivedAt)
          : "-",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Archived at" />
      ),
    },
    {
      accessorKey: "todoGenerationEnabled",
      cell: ({ row }) => (row.original.todoGenerationEnabled ? "Yes" : "No"),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Suggested tasks" />
      ),
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) => formatTimestampToFriendlyDate(row.original.createdAt),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
    },
    {
      accessorKey: "updatedAt",
      cell: ({ row }) => formatTimestampToFriendlyDate(row.original.updatedAt),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Updated at" />
      ),
    },
  ];
}
