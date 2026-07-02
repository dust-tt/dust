import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type {
  MembershipOriginType,
  MembershipSeatType,
} from "@app/types/memberships";
import { MEMBERSHIP_SEAT_TYPES } from "@app/types/memberships";
import type { ActiveRoleType, RoleType } from "@app/types/user";
import { ACTIVE_ROLES } from "@app/types/user";
import { IconButton, Trash01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export type MemberDisplayType = {
  createdAt: number;
  lastLoginAt: number | null;
  email: string;
  name: string;
  role: RoleType;
  sId: string;
  origin?: MembershipOriginType;
  seatType?: MembershipSeatType;
  // Upcoming seat change scheduled for a future date (e.g. flips at a pending
  // contract start). `seatType` above stays the active seat.
  scheduledSeatType?: MembershipSeatType | null;
  scheduledSeatChangeAt?: number | null;
};

export function makeColumnsForMembers({
  onRevokeMember,
  onUpdateMemberRole,
  onUpdateMemberSeatType,
  readonly,
}: {
  onRevokeMember: (m: MemberDisplayType) => Promise<void>;
  onUpdateMemberRole: (
    m: MemberDisplayType,
    role: ActiveRoleType
  ) => Promise<void>;
  onUpdateMemberSeatType: (
    m: MemberDisplayType,
    seatType: MembershipSeatType
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
      accessorKey: "origin",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Origin" />
      ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
      cell: ({ row }) => {
        const { origin } = row.original;
        return <span>{origin ?? "-"}</span>;
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

  baseColumns.push({
    accessorKey: "seatType",
    header: ({ column }) => (
      <PokeColumnSortableHeader column={column} label="Seat type" />
    ),
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
    cell: ({ row }) => {
      const member = row.original;

      const scheduledChange =
        member.scheduledSeatType &&
        member.scheduledSeatType !== member.seatType ? (
          <span className="text-xs text-gray-500">
            {`→ ${member.scheduledSeatType}`}
            {member.scheduledSeatChangeAt
              ? ` on ${formatTimestampToFriendlyDate(member.scheduledSeatChangeAt)}`
              : ""}
          </span>
        ) : null;

      if (readonly) {
        return (
          <div className="flex flex-col">
            <span>{member.seatType ?? "-"}</span>
            {scheduledChange}
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-1">
          <select
            className="rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-900"
            value={member.seatType ?? ""}
            onChange={async (e) => {
              await onUpdateMemberSeatType(
                member,
                e.target.value as MembershipSeatType
              );
            }}
          >
            <option value="" disabled>
              -
            </option>
            {MEMBERSHIP_SEAT_TYPES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          {scheduledChange}
        </div>
      );
    },
  });

  if (!readonly) {
    baseColumns.push({
      id: "actions",
      cell: ({ row }) => {
        const member = row.original;

        // Hide the revoke button for provisioned users and users with no role.
        return member.role !== "none" && member.origin !== "provisioned" ? (
          <IconButton
            icon={Trash01}
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
