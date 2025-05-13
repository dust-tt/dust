import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";

interface MCPServerView {
  id: string;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  server: {
    id: string;
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
      accessorKey: "id",
      cell: ({ row }) => {
        const { mcpServerViewLink, id } = row.original;

        return <LinkWrapper href={mcpServerViewLink}>{id}</LinkWrapper>;
      },
      header: "sId",
    },
    {
      accessorKey: "server.name",
      cell: ({ row }) => {
        const { mcpServerViewLink, server } = row.original;

        return (
          <LinkWrapper href={mcpServerViewLink}>{server.name}</LinkWrapper>
        );
      },
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Server Name</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "space",
      cell: ({ row }) => {
        const { spaceLink, spaceId } = row.original;
        return <LinkWrapper href={spaceLink}>{spaceId}</LinkWrapper>;
      },
      header: "Space",
    },
    {
      accessorKey: "editedBy",
      header: "Last edited by",
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) => {
        return formatTimestampToFriendlyDate(row.original.createdAt);
      },
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Created At</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "editedAt",
      cell: ({ row }) => {
        return row.original.editedAt
          ? formatTimestampToFriendlyDate(row.original.editedAt)
          : "";
      },
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Last edited at</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
  ];
}
