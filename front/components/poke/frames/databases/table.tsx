import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeFrameDatabase } from "@app/lib/api/poke/frames";
import { formatFileSize } from "@app/lib/utils";
import { usePokeFrameDatabases } from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import type { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<PokeFrameDatabase>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
  },
  {
    accessorKey: "sizeBytes",
    header: "Size",
    cell: ({ row }) => formatFileSize(row.original.sizeBytes),
  },
];

interface FrameDatabaseDataTableProps {
  frameId: string;
  owner: LightWorkspaceType;
}

export function FrameDatabaseDataTable({
  frameId,
  owner,
}: FrameDatabaseDataTableProps) {
  const useDatabasesForFrame = (props: PokeConditionalFetchProps) =>
    usePokeFrameDatabases({ ...props, frameId });

  return (
    <PokeDataTableConditionalFetch
      buttonText="List live databases (wakes the sandbox)"
      header="Databases"
      owner={owner}
      useSWRHook={useDatabasesForFrame}
    >
      {(items) => <PokeDataTable columns={columns} data={items} />}
    </PokeDataTableConditionalFetch>
  );
}
