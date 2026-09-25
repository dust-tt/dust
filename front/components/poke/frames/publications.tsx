import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeFramePublicationSummary } from "@app/lib/api/poke/frames";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeFramePublications } from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function makeColumnsForFramePublication(): ColumnDef<PokeFramePublicationSummary>[] {
  return [
    {
      accessorKey: "publishedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Published" />
      ),
      cell: ({ row }) =>
        formatTimestampToFriendlyDate(
          new Date(row.original.publishedAt).getTime()
        ),
    },
    {
      accessorKey: "publicationId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Publication ID" />
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-mono text-xs">
          {row.original.publicationId}
          {row.original.isActive && (
            <Chip size="xs" color="success" label="Active" />
          )}
        </span>
      ),
    },
    {
      accessorKey: "publisher",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Publisher" />
      ),
      cell: ({ row }) => row.original.publisher ?? "—",
    },
    {
      accessorKey: "functionCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Functions" />
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

interface FramePublicationDataTableProps {
  frameId: string;
  owner: LightWorkspaceType;
}

export function FramePublicationDataTable({
  frameId,
  owner,
}: FramePublicationDataTableProps) {
  const usePublicationsForFrame = (props: PokeConditionalFetchProps) =>
    usePokeFramePublications({ ...props, frameId });

  return (
    <PokeDataTableConditionalFetch
      header="Publications"
      loadOnInit
      owner={owner}
      useSWRHook={usePublicationsForFrame}
    >
      {(items) => (
        <PokeDataTable
          columns={makeColumnsForFramePublication()}
          data={items}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
