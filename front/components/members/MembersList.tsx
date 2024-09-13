import {
  ChevronRightIcon,
  Chip,
  DataTable,
  Icon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  RoleType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import _ from "lodash";
import React, { useMemo, useState } from "react";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import { useSearchMembers } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";

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
  const [selectedMember, setSelectedMember] =
    useState<UserTypeWithWorkspaces | null>(null);
  const { members, totalMembersCount, isLoading } = useSearchMembers(
    owner.sId,
    searchText,
    pagination.pageIndex,
    pagination.pageSize
  );

  const columns = [
    {
      id: "name",
      cell: (info: Info) => (
        <DataTable.CellContent
          avatarUrl={info.row.original.icon}
          description={info.row.original.email}
        >
          {info.row.original.name}{" "}
          {info.row.original.userId === currentUserId ? " (you)" : ""}
        </DataTable.CellContent>
      ),
      enableSorting: false,
      meta: {
        width: "46rem",
      },
    },
    {
      id: "role",
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
        width: "6rem",
      },
    },
    {
      id: "open",
      cell: (info: Info) => (
        <DataTable.CellContent>
          <Icon
            visual={ChevronRightIcon}
            className={classNames(
              "text-element-600",
              info.row.original.userId === currentUserId ? "invisible" : ""
            )}
          />
        </DataTable.CellContent>
      ),
    },
  ];

  const rows = useMemo(() => {
    console.log(">>>>> members", members)
    return getTableRows(
      members,
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
        owner={owner}
      />
    </div>
  );
}
