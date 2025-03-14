import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import type { AppType, LightWorkspaceType } from "@app/types";

export function makeColumnsForApps(
  owner: LightWorkspaceType
): ColumnDef<AppType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const { space, sId } = row.original;

        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/spaces/${space.sId}/apps/${sId}`}
          >
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
      accessorKey: "description",
      header: "Description",
    },
  ];
}
