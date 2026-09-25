import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeFrameFunctionName } from "@app/lib/api/poke/frames";
import { usePokeFrameFunctionNames } from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function makeColumnsForFrameFunctionName({
  frameId,
  owner,
}: {
  frameId: string;
  owner: LightWorkspaceType;
}): ColumnDef<PokeFrameFunctionName>[] {
  return [
    {
      accessorKey: "slug",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <LinkWrapper
            href={`/poke/${owner.sId}/files/${frameId}/functions/${row.original.slug}`}
            className="text-highlight-500"
          >
            {row.original.slug}
          </LinkWrapper>
          {!row.original.isInActivePublication && (
            <Chip size="xs" color="warning" label="Not in active publication" />
          )}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Description" />
      ),
    },
    {
      accessorKey: "versionCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Versions" />
      ),
    },
    {
      accessorKey: "invocationCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Invocations" />
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
  const useFunctionNamesForFrame = (props: PokeConditionalFetchProps) =>
    usePokeFrameFunctionNames({ ...props, frameId });

  return (
    <PokeDataTableConditionalFetch
      header="Functions"
      loadOnInit
      owner={owner}
      useSWRHook={useFunctionNamesForFrame}
    >
      {(items) => (
        <PokeDataTable
          columns={makeColumnsForFrameFunctionName({ frameId, owner })}
          data={items}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
