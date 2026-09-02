import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokePodFunction } from "@app/lib/api/poke/projects";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeFrameFunctions } from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import type { ColumnDef } from "@tanstack/react-table";

// Frame function detail pages land in PR 2; until then the slug is not a link.
const columns: ColumnDef<PokePodFunction>[] = [
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
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <PokeColumnSortableHeader column={column} label="Updated" />
    ),
    cell: ({ row }) =>
      formatTimestampToFriendlyDate(new Date(row.original.updatedAt).getTime()),
  },
];

interface FrameFunctionDataTableProps {
  frameId: string;
  owner: LightWorkspaceType;
}

export function FrameFunctionDataTable({
  frameId,
  owner,
}: FrameFunctionDataTableProps) {
  const useFunctionsForFrame = (props: PokeConditionalFetchProps) =>
    usePokeFrameFunctions({ ...props, frameId });

  return (
    <PokeDataTableConditionalFetch
      header="Functions"
      loadOnInit
      owner={owner}
      useSWRHook={useFunctionsForFrame}
    >
      {(items) => <PokeDataTable columns={columns} data={items} />}
    </PokeDataTableConditionalFetch>
  );
}
