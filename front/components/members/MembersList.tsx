import {
  isFullUserType,
  type SearchMemberWithWorkspaceType,
} from "@app/components/members/MemberSelectionTable";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import type { SearchMembersAdminResponseBody } from "@app/lib/api/workspace";
import assert from "@app/lib/utils/assert";
import type { MembershipOriginType } from "@app/types/memberships";
import type { RoleType, UserType } from "@app/types/user";
import {
  Chip,
  DataTable,
  IconButton,
  LoadingBlock,
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
  onClick: () => void;
  onRemoveMemberClick?: () => void;
  origin?: MembershipOriginType;
};

type Info = CellContext<RowData, string>;

function getTableRows({
  allUsers,
  onClick,
  onRemoveMemberClick,
  currentUserId,
}: {
  allUsers: SearchMemberWithWorkspaceType[];
  onClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  currentUserId: string;
}): RowData[] {
  return allUsers.map((user) => {
    const fullUser = isFullUserType(user);
    return {
      icon: user.image ?? "",
      name: user.fullName,
      userId: user.sId,
      email: user.email ?? "",
      role: user.workspace.role ?? "none",
      status: fullUser && user.lastLoginAt === null ? "Unregistered" : "Active",
      groups: user.workspace.groups ?? [],
      isCurrentUser: user.sId === currentUserId,
      onClick: () => onClick(user),
      onRemoveMemberClick: () => onRemoveMemberClick?.(user),
      origin: fullUser ? user.origin : undefined,
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
    cell: (info: Info) => (
      <DataTable.CellContent>
        <Chip
          label={capitalize(displayRole(info.row.original.role))}
          color={
            info.row.original.role !== "none"
              ? ROLES_DATA[info.row.original.role]["color"]
              : undefined
          }
        />
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-32",
    },
  },
  {
    id: "remove" as const,
    header: "",
    cell: (info: Info) => (
      <DataTable.CellContent>
        {info.row.original.isCurrentUser ||
        info.row.original.origin === "provisioned" ? (
          <></>
        ) : (
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
  currentUser: UserType | null;
  membersData: MembersData;
  onRowClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  showColumns: ("name" | "email" | "role" | "remove" | "status" | "groups")[];
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
}

export function MembersList({
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
    });
  }, [members, onRowClick, onRemoveMemberClick, currentUser?.sId]);

  return (
    <>
      {isLoading ? (
        <div className="flex w-full flex-col space-y-2">
          <LoadingBlock className="h-8 w-full rounded-xl" />
          <LoadingBlock className="h-8 w-full rounded-xl" />
          <LoadingBlock className="h-8 w-full rounded-xl" />
        </div>
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
