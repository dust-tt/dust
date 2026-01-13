import { Chip, IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import type { GroupKind, GroupType, WorkspaceType } from "@app/types";

export const getPokeGroupKindChipColor = (kind: GroupKind) => {
  switch (kind) {
    case "provisioned":
      return "blue";
    case "global":
      return "green";
    case "system":
      return "warning";
    case "agent_editors":
    case "skill_editors":
      return "rose";
    default:
      return "primary";
  }
};

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
        const kind: GroupKind = row.getValue("kind");
        return <Chip color={getPokeGroupKindChipColor(kind)}>{kind}</Chip>;
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
