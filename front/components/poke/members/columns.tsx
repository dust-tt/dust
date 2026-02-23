import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { MembershipOriginType } from "@app/types/memberships";
import type { ActiveRoleType, RoleType } from "@app/types/user";
import { ACTIVE_ROLES } from "@app/types/user";
import { IconButton, TrashIcon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export type MemberDisplayType = {
  createdAt: number;
  lastLoginAt: number | null;
  email: string;
  name: string;
  role: RoleType;
  sId: string;
  origin?: MembershipOriginType;
};

export function makeColumnsForMembers({
  onRevokeMember,
  onUpdateMemberRole,
  readonly,
}: {
  onRevokeMember: (m: MemberDisplayType) => Promise<void>;
  onUpdateMemberRole: (
    m: MemberDisplayType,
    role: ActiveRoleType
  ) => Promise<void>;
  readonly?: boolean;
}): ColumnDef<MemberDisplayType>[] {
  const baseColumns: ColumnDef<MemberDisplayType>[] = [
    {
      accessorKey: "sId",
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
      accessorKey: "email",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Email" />
      ),
    },
    {
      accessorKey: "lastLoginAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last login" />
      ),
      cell: ({ row }) => {
        const lastLoginAt: number | null = row.getValue("lastLoginAt");

        if (!lastLoginAt) {
          return "never logged in";
        }

        return formatTimestampToFriendlyDate(lastLoginAt);
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
      cell: ({ row }) => {
        const createdAt: string | null = row.getValue("createdAt");

        if (!createdAt) {
          return;
        }

        return formatTimestampToFriendlyDate(new Date(createdAt).getTime());
      },
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Role" />
      ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
      cell: ({ row }) => {
        const member = row.original;
        if (member.role === "none") {
          return <span className="py-2 pl-3 italic">revoked</span>;
        }

        if (readonly) {
          return <span>{member.role}</span>;
        }

        return (
          <select
            className="rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-900"
            value={member.role}
            onChange={async (e) => {
              await onUpdateMemberRole(
                member,
                e.target.value as ActiveRoleType
              );
            }}
          >
            {ACTIVE_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        );
      },
    },
  ];

  if (!readonly) {
    baseColumns.push({
      id: "actions",
      cell: ({ row }) => {
        const member = row.original;

        // Hide the revoke button for provisioned users and users with no role.
        return member.role !== "none" && member.origin !== "provisioned" ? (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="outline"
            onClick={async () => {
              await onRevokeMember(member);
            }}
          />
        ) : null;
      },
    });
  }

  return baseColumns;
}
