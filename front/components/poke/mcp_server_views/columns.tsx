import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { PokeMCPServerViewListItemType } from "@app/lib/api/poke/mcp_server_views";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

interface MCPServerView extends PokeMCPServerViewListItemType {
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
      accessorKey: "name",
      cell: ({ row }) => {
        const { mcpServerViewLink, name } = row.original;

        return <LinkWrapper href={mcpServerViewLink}>{name ?? ""}</LinkWrapper>;
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Custom name" />
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
      accessorKey: "server.sId",
      cell: ({ row }) => {
        const { server } = row.original;

        return `${server.sId}`;
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Server ID" />
      ),
    },
    {
      accessorKey: "space.name",
      cell: ({ row }) => {
        const { spaceLink, space } = row.original;
        return <LinkWrapper href={spaceLink}>{space.name}</LinkWrapper>;
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
