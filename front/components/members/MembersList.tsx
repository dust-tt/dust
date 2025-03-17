import { Chip, DataTable, Page, Spinner } from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import _ from "lodash";
import React, { useEffect, useMemo, useState } from "react";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type {
  RoleType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  email: string;
  role: RoleType;
  onClick: () => void;
};

type Info = CellContext<RowData, string>;

function getTableRows(
  allUsers: UserTypeWithWorkspaces[],
  onClick: (user: UserTypeWithWorkspaces) => void
): RowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
    role: user.workspaces[0].role,
    onClick: () => onClick(user),
  }));
}

export function MembersList({
  owner,
  currentUserId,
  searchText,
}: {
  owner: WorkspaceType;
  currentUserId: string;
  searchText: string;
}) {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: 25 });
  }, [searchText, setPagination]);

  const [selectedMember, setSelectedMember] =
    useState<UserTypeWithWorkspaces | null>(null);
  const {
    members,
    totalMembersCount,
    isLoading,
    mutateRegardlessOfQueryParams: mutateMembers,
  } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
  });
  const columns = [
    {
      id: "name",
      header: "Name",
      cell: (info: Info) => (
        <DataTable.CellContent avatarUrl={info.row.original.icon}>
          {info.row.original.name}{" "}
          {info.row.original.userId === currentUserId ? " (you)" : ""}
        </DataTable.CellContent>
      ),
      enableSorting: false,
    },
    {
      id: "email",
      accessorKey: "email",
      header: "Email",
      cell: (info: Info) => (
        <DataTable.CellContent>{info.row.original.email}</DataTable.CellContent>
      ),
    },
    {
      id: "role",
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
  ];

  const rows = useMemo(() => {
    const filteredMembers = members.filter(
      (m) => m.workspaces[0].role !== "none"
    );
    return getTableRows(
      filteredMembers,
      (user: UserTypeWithWorkspaces | null) => {
        setSelectedMember(user);
      }
    );
  }, [members]);

  return (
    <div className="flex flex-col gap-2">
      <Page.H variant="h5">Members</Page.H>
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
      <ChangeMemberModal
        onClose={() => setSelectedMember(null)}
        member={selectedMember}
        mutateMembers={mutateMembers}
      />
    </div>
  );
}
