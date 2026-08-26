import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { isFullUserType } from "@app/components/members/MemberSelectionTable";
import {
  displayRole,
  normalizeDisplayRole,
  ROLES_DATA,
} from "@app/components/members/Roles";
import type { SearchMembersAdminResponseBody } from "@app/lib/api/workspace";
import assert from "@app/lib/utils/assert";
import type { MembershipOriginType } from "@app/types/memberships";
import type { RoleType, UserType } from "@app/types/user";
import {
  Chip,
  DataTable,
  DataTableLoadingSkeleton,
  IconButton,
  XClose,
} from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import capitalize from "lodash/capitalize";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useMemo } from "react";
import type { KeyedMutator } from "swr";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  email: string;
  role: RoleType;
  status: "Active" | "Unregistered";
  groups: string[];
  isCurrentUser: boolean;
  canRemove: boolean;
  onClick: () => void;
  onRemoveMemberClick?: () => void;
  origin?: MembershipOriginType;
};

type Info = CellContext<RowData, string>;

function RoleCell({ role }: { role: RoleType }) {
  // `builder` is deprecated: display it as a regular member.
  const displayedRole = normalizeDisplayRole(role);

  return (
    <DataTable.CellContent>
      <Chip
        label={capitalize(displayRole(displayedRole))}
        color={
          displayedRole !== "none"
            ? ROLES_DATA[displayedRole]["color"]
            : undefined
        }
      />
    </DataTable.CellContent>
  );
}

function getTableRows({
  allUsers,
  onClick,
  onRemoveMemberClick,
  currentUserId,
  allowRemoveSelfAndProvisionedUsers,
}: {
  allUsers: SearchMemberWithWorkspaceType[];
  onClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  currentUserId: string;
  allowRemoveSelfAndProvisionedUsers: boolean;
}): RowData[] {
  return allUsers.map((user) => {
    const fullUser = isFullUserType(user);
    const isCurrentUser = user.sId === currentUserId;
    const origin = fullUser ? user.origin : undefined;
    return {
      icon: user.image ?? "",
      name: user.fullName,
      userId: user.sId,
      email: user.email ?? "",
      role: user.workspace.role ?? "none",
      status: fullUser && user.lastLoginAt === null ? "Unregistered" : "Active",
      groups: user.workspace.groups ?? [],
      isCurrentUser,
      canRemove:
        allowRemoveSelfAndProvisionedUsers ||
        (!isCurrentUser && origin !== "provisioned"),
      onClick: () => onClick(user),
      onRemoveMemberClick: () => onRemoveMemberClick?.(user),
      origin,
    };
  });
}

type MembersData = {
  members: SearchMemberWithWorkspaceType[];
  totalMembersCount: number;
  isLoading: boolean;
  mutateRegardlessOfQueryParams:
    | KeyedMutator<SearchMembersAdminResponseBody>
    | (() => void);
};

const memberColumns = [
  {
    id: "name" as const,
    header: "Name",
    cell: (info: Info) => (
      <DataTable.CellContent avatarUrl={info.row.original.icon} roundedAvatar>
        {info.row.original.name}
        {info.row.original.isCurrentUser && (
          <span className="ml-3 text-muted-foreground">(you)</span>
        )}
      </DataTable.CellContent>
    ),
    enableSorting: false,
  },
  {
    id: "email" as const,
    accessorKey: "email",
    header: "Email",
    cell: (info: Info) => (
      <DataTable.CellContent>{info.row.original.email}</DataTable.CellContent>
    ),
  },
  {
    id: "role" as const,
    header: "Role",
    accessorFn: (row: RowData) => row.role,
    cell: (info: Info) => <RoleCell role={info.row.original.role} />,
    meta: {
      className: "w-32",
    },
  },
  {
    id: "remove" as const,
    header: "",
    cell: (info: Info) => (
      <DataTable.CellContent>
        {info.row.original.canRemove && (
          <IconButton
            icon={XClose}
            onClick={info.row.original.onRemoveMemberClick}
          />
        )}
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-12",
    },
  },
  {
    id: "status" as const,
    header: "Status",
    cell: (info: Info) => {
      return (
        <DataTable.CellContent>
          {info.row.original.status +
            (info.row.original.origin
              ? ` (${capitalize(info.row.original.origin)})`
              : "")}
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "groups" as const,
    header: "Groups",
    cell: (info: Info) => (
      <DataTable.CellContent className="max-w-40 truncate capitalize">
        {info.row.original.groups.join(", ")}
      </DataTable.CellContent>
    ),
  },
];

interface MembersListProps {
  allowRemoveSelfAndProvisionedUsers?: boolean;
  currentUser: UserType | null;
  membersData: MembersData;
  onRowClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  showColumns: ("name" | "email" | "role" | "remove" | "status" | "groups")[];
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
}

export function MembersList({
  allowRemoveSelfAndProvisionedUsers = false,
  currentUser,
  membersData,
  onRowClick,
  onRemoveMemberClick,
  showColumns,
  pagination,
  setPagination,
}: MembersListProps) {
  assert(
    !showColumns.includes("remove") || onRemoveMemberClick,
    "onRemoveMemberClick is required if remove column is shown"
  );

  const { members, totalMembersCount, isLoading } = membersData;

  const columns = memberColumns.filter((c) => showColumns.includes(c.id));

  const rows = useMemo(() => {
    const filteredMembers = members.filter((m) => m.workspace.role !== "none");
    return getTableRows({
      allUsers: filteredMembers,
      onClick: onRowClick,
      onRemoveMemberClick,
      currentUserId: currentUser?.sId ?? "current-user-not-loaded",
      allowRemoveSelfAndProvisionedUsers,
    });
  }, [
    members,
    onRowClick,
    onRemoveMemberClick,
    currentUser?.sId,
    allowRemoveSelfAndProvisionedUsers,
  ]);

  return (
    <>
      {isLoading ? (
        <DataTableLoadingSkeleton showSelectionColumn={false} rows={3} />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          pagination={pagination}
          setPagination={setPagination}
          totalRowCount={totalMembersCount}
        />
      )}
    </>
  );
}
