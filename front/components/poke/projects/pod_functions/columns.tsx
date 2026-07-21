import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { PokePodFunction } from "@app/lib/api/poke/projects";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForProjectPodFunction(): ColumnDef<PokePodFunction>[] {
  return [
    {
      accessorKey: "slug",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Slug" />
      ),
      cell: ({ row }) =>row.original.slug,
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
      cell: ({ row }) => row.original.sId
    },
  ];
}
