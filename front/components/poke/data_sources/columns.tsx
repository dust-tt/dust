import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";

interface DataSources {
  connectorProvider: string | null;
  id: number;
  sId: string;
  name: string;
  editedBy: string | undefined;
  editedAt: number | undefined;
}

export function makeColumnsForDataSources(
  owner: WorkspaceType
): ColumnDef<DataSources>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return (
          <LinkWrapper href={`/poke/${owner.sId}/data_sources/${sId}`}>
            {sId}
          </LinkWrapper>
        );
      },
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
      accessorKey: "connectorProvider",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Provider" />
      ),
    },
    {
      accessorKey: "editedBy",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last edited by" />
      ),
    },
    {
      accessorKey: "editedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last edited at" />
      ),
      cell: ({ row }) => {
        const editedAt: number | undefined = row.getValue("editedAt");

        if (!editedAt) {
          return "";
        }

        return formatTimestampToFriendlyDate(editedAt);
      },
    },
  ];
}
