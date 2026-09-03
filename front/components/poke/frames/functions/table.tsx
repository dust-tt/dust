import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeFrameFunction } from "@app/lib/api/poke/frames";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeFrameFunctions } from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function makeColumnsForFrameFunction({
  frameId,
  owner,
}: {
  frameId: string;
  owner: LightWorkspaceType;
}): ColumnDef<PokeFrameFunction>[] {
  return [
    {
      accessorKey: "slug",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
      cell: ({ row }) => (
        <LinkWrapper
          href={`/poke/${owner.sId}/files/${frameId}/functions/${row.original.sId}`}
          className="text-highlight-500"
        >
          {row.original.slug}
        </LinkWrapper>
      ),
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
      {(items) => (
        <PokeDataTable
          columns={makeColumnsForFrameFunction({ frameId, owner })}
          data={items}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
