import {
  Chip,
  DataTable,
  IconButton,
  LoadingBlock,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import assert from "assert";
import _ from "lodash";
import React, { useMemo } from "react";
import type { KeyedMutator } from "swr";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";
import type {
  MembershipOriginType,
  RoleType,
  UserType,
  UserTypeWithWorkspace,
} from "@app/types";

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
  allUsers: UserTypeWithWorkspace[];
  onClick: (user: UserTypeWithWorkspace) => void;
  onRemoveMemberClick?: (user: UserTypeWithWorkspace) => void;
  currentUserId: string;
}): RowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
    role: user.workspace.role,
    status: user.lastLoginAt === null ? "Unregistered" : "Active",
    groups: user.workspace.groups ?? [],
    isCurrentUser: user.sId === currentUserId,
    onClick: () => onClick(user),
    onRemoveMemberClick: () => onRemoveMemberClick?.(user),
    origin: user.origin,
  }));
}

type MembersData = {
  members: UserTypeWithWorkspace[];
  totalMembersCount: number;
  isLoading: boolean;
  mutateRegardlessOfQueryParams:
    | KeyedMutator<SearchMembersResponseBody>
    | (() => void);
};

const memberColumns = [
  {
    id: "name" as const,
    header: "Name",
    cell: (info: Info) => (
      <DataTable.CellContent avatarUrl={info.row.original.icon}>
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
          label={_.capitalize(displayRole(info.row.original.role))}
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
            icon={XMarkIcon}
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
              ? ` (${_.capitalize(info.row.original.origin)})`
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
  onRowClick: (user: UserTypeWithWorkspace) => void;
  onRemoveMemberClick?: (user: UserTypeWithWorkspace) => void;
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
