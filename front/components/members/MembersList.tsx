import {
  Chip,
  DataTable,
  IconButton,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import assert from "assert";
import _ from "lodash";
import React, { useEffect, useMemo } from "react";
import type { KeyedMutator } from "swr";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";
import type { RoleType, UserType, UserTypeWithWorkspaces } from "@app/types";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  email: string;
  role: RoleType;
  isCurrentUser: boolean;
  onClick: () => void;
  onRemoveMemberClick?: () => void;
};

type Info = CellContext<RowData, string>;

function getTableRows({
  allUsers,
  onClick,
  onRemoveMemberClick,
  currentUserId,
}: {
  allUsers: UserTypeWithWorkspaces[];
  onClick: (user: UserTypeWithWorkspaces) => void;
  onRemoveMemberClick?: (user: UserTypeWithWorkspaces) => void;
  currentUserId: string;
}): RowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
    role: user.workspaces[0].role,
    isCurrentUser: user.sId === currentUserId,
    onClick: () => onClick(user),
    onRemoveMemberClick: () => onRemoveMemberClick?.(user),
  }));
}

type MembersData = {
  members: UserTypeWithWorkspaces[];
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
        {info.row.original.name}{" "}
        {info.row.original.isCurrentUser ? " (you)" : ""}
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
        {info.row.original.isCurrentUser ? (
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
];

export function MembersList({
  currentUser,
  membersData,
  onRowClick,
  onRemoveMemberClick,
  showColumns,
}: {
  currentUser: UserType | null;
  membersData: MembersData;
  onRowClick: (user: UserTypeWithWorkspaces) => void;
  onRemoveMemberClick?: (user: UserTypeWithWorkspaces) => void;
  showColumns: ("name" | "email" | "role" | "remove")[];
}) {
  assert(
    !showColumns.includes("remove") || onRemoveMemberClick,
    "onRemoveMemberClick is required if remove column is shown"
  );
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: 25 });
  }, [setPagination]);

  const { members, totalMembersCount, isLoading } = membersData;

  const columns = memberColumns.filter((c) => showColumns.includes(c.id));

  const rows = useMemo(() => {
    const filteredMembers = members.filter(
      (m) => m.workspaces[0].role !== "none"
    );
    return getTableRows({
      allUsers: filteredMembers,
      onClick: onRowClick,
      onRemoveMemberClick,
      currentUserId: currentUser?.sId ?? "current-user-not-loaded",
    });
  }, [members, onRowClick, onRemoveMemberClick, currentUser]);

  return (
    <>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
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
