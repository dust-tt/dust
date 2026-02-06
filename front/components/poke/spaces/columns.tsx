import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SpaceType, WorkspaceType } from "@app/types";

export function makeColumnsForSpaces(
  owner: WorkspaceType
): ColumnDef<SpaceType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return (
          <LinkWrapper href={`/poke/${owner.sId}/spaces/${sId}`}>
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
      accessorKey: "kind",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Kind" />
      ),
    },
    {
      accessorKey: "isRestricted",
      cell: ({ row }) => {
        const isRestricted: boolean = row.getValue("isRestricted");

        return isRestricted ? "Yes" : "No";
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Is restricted" />
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
      cell: ({ row }) => {
        const createdAt: number = row.getValue("createdAt");

        return formatTimestampToFriendlyDate(createdAt);
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Updated at" />
      ),
      cell: ({ row }) => {
        const updatedAt: number = row.getValue("updatedAt");

        return formatTimestampToFriendlyDate(updatedAt);
      },
    },
  ];
}
