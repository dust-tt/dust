import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { PokePodFunction } from "@app/lib/api/poke/projects";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForProjectPodFunction(): ColumnDef<PokePodFunction>[] {
  return [
    {
      accessorKey: "slug",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Slug" />
      ),
      cell: ({ row }) => row.original.slug,
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Description" />
      ),
      cell: ({ row }) => row.original.description,
    },
    {
      accessorKey: "sId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
      cell: ({ row }) => row.original.sId,
    },
    {
      id: "author",
      accessorFn: (row) => row.author ?? "",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Author" />
      ),
      cell: ({ row }) => row.original.author ?? "—",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created" />
      ),
      cell: ({ row }) =>
        formatTimestampToFriendlyDate(
          new Date(row.original.createdAt).getTime()
        ),
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Updated" />
      ),
      cell: ({ row }) =>
        formatTimestampToFriendlyDate(
          new Date(row.original.updatedAt).getTime()
        ),
    },
  ];
}
