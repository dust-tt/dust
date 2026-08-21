import { getPokeGroupKindChipColor } from "@app/components/poke/groups/columns";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { PokeGroupPermissionType } from "@app/lib/api/poke/group_permissions";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForGroupPermissions(
  owner: LightWorkspaceType
): ColumnDef<PokeGroupPermissionType>[] {
  return [
    {
      id: "group",
      accessorFn: (row) => row.group.name,
      cell: ({ row }) => {
        const { group } = row.original;

        return (
          <LinkWrapper href={`/poke/${owner.sId}/groups/${group.sId}`}>
            {group.name}
          </LinkWrapper>
        );
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Group" />
      ),
    },
    {
      id: "groupKind",
      accessorFn: (row) => row.group.kind,
      cell: ({ row }) => {
        const { group } = row.original;

        return (
          <Chip color={getPokeGroupKindChipColor(group.kind)}>
            {group.kind}
          </Chip>
        );
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Group kind" />
      ),
    },
    {
      accessorKey: "grantType",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Grant type" />
      ),
    },
    {
      accessorKey: "resourceType",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Resource type" />
      ),
    },
    {
      accessorKey: "resourceId",
      cell: ({ row }) => {
        const resourceId: number = row.getValue("resourceId");

        return resourceId === WHOLE_TYPE_RESOURCE_ID
          ? "All instances (-1)"
          : resourceId.toString();
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Resource id" />
      ),
    },
  ];
}
