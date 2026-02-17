import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { GroupKind, GroupType } from "@app/types/groups";
import type { WorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

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
      cell: ({ row }) => {
        const kind: GroupKind = row.getValue("kind");
        return <Chip color={getPokeGroupKindChipColor(kind)}>{kind}</Chip>;
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Kind" />
      ),
    },
    {
      accessorKey: "memberCount",
      cell: ({ row }) => {
        const memberCount: number = row.getValue("memberCount");

        return memberCount.toString();
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Members" />
      ),
    },
  ];
}
