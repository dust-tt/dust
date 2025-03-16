import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

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
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>sId</p>
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
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Name</p>
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
      accessorKey: "kind",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Kind</p>
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
      accessorKey: "isRestricted",
      cell: ({ row }) => {
        const isRestricted: boolean = row.getValue("isRestricted");

        return isRestricted ? "Yes" : "No";
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Is Restricted</p>
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
      accessorKey: "createdAt",
      cell: ({ row }) => {
        const createdAt: number = row.getValue("createdAt");

        return formatTimestampToFriendlyDate(createdAt);
      },
    },
    {
      accessorKey: "updatedAt",
      cell: ({ row }) => {
        const updatedAt: number = row.getValue("updatedAt");

        return formatTimestampToFriendlyDate(updatedAt);
      },
    },
  ];
}
