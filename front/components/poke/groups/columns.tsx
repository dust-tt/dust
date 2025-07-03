import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import type { GroupType, WorkspaceType } from "@app/types";

export function makeColumnsForGroups(
  owner: WorkspaceType
): ColumnDef<GroupType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return (
          <LinkWrapper href={`/poke/${owner.sId}/groups/${sId}`}>
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
      cell: ({ row }) => {
        const kind: string = row.getValue("kind");
        
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            kind === "provisioned" 
              ? "bg-blue-100 text-blue-800"
              : kind === "global"
              ? "bg-green-100 text-green-800"
              : kind === "system"
              ? "bg-red-100 text-red-800"
              : kind === "agent_editors"
              ? "bg-purple-100 text-purple-800"
              : "bg-gray-100 text-gray-800"
          }`}>
            {kind}
          </span>
        );
      },
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
      accessorKey: "memberCount",
      cell: ({ row }) => {
        const memberCount: number = row.getValue("memberCount");

        return memberCount.toString();
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Members</p>
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