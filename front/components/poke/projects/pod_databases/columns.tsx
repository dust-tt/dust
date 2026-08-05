import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { PokePodDatabase } from "@app/lib/api/poke/projects";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForProjectPodDatabase(): ColumnDef<PokePodDatabase>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
      cell: ({ row }) => row.original.name,
    },
    {
      accessorKey: "sizeBytes",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Size (bytes)" />
      ),
      cell: ({ row }) => row.original.sizeBytes.toLocaleString(),
    },
  ];
}
