import { IconButton, TrashIcon } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { ActiveRoleType, RoleType } from "@app/types";
import { ACTIVE_ROLES } from "@app/types";

export type MemberDisplayType = {
  createdAt: number;
  email: string;
  name: string;
  provider: string | null;
  role: RoleType;
  sId: string;
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
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
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
      accessorKey: "email",
      header: "email",
    },
    {
      accessorKey: "provider",
      header: "Provider",
    },
    {
      accessorKey: "createdAt",
      header: "Created at",
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
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Role</p>
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

        return member.role !== "none" ? (
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
