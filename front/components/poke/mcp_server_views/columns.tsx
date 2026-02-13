import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

interface MCPServerView {
  sId: string;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  server: {
    sId: string;
    name: string;
    description: string;
  };
  editedAt?: number;
  editedBy?: string;
  mcpServerViewLink: string;
  spaceLink: string;
}

export function makeColumnsForMCPServerViews(): ColumnDef<MCPServerView>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const { mcpServerViewLink, sId } = row.original;

        return <LinkWrapper href={mcpServerViewLink}>{sId}</LinkWrapper>;
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "server.name",
      cell: ({ row }) => {
        const { mcpServerViewLink, server } = row.original;

        return (
          <LinkWrapper href={mcpServerViewLink}>{server.name}</LinkWrapper>
        );
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Server name" />
      ),
    },
    {
      accessorKey: "space",
      cell: ({ row }) => {
        const { spaceLink, spaceId } = row.original;
        return <LinkWrapper href={spaceLink}>{spaceId}</LinkWrapper>;
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Space" />
      ),
    },
    {
      accessorKey: "editedBy",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last edited by" />
      ),
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) => {
        return formatTimestampToFriendlyDate(row.original.createdAt);
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
    },
    {
      accessorKey: "editedAt",
      cell: ({ row }) => {
        return row.original.editedAt
          ? formatTimestampToFriendlyDate(row.original.editedAt)
          : "";
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last edited at" />
      ),
    },
  ];
}
