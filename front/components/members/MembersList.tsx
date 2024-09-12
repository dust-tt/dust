import {
  Button,
  ChevronRightIcon,
  Chip,
  DataTable,
  Icon,
  PlusIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  ActiveRoleType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import _ from "lodash";
import React, { useMemo, useState } from "react";

import { ROLES_DATA } from "@app/components/members/Roles";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import { useSearchMembers } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  email: string;
  role: ActiveRoleType;
  onClick: () => void;
};

type Info = CellContext<RowData, unknown>;

function getTableRows(
  allUsers: UserTypeWithWorkspaces[],
  onClick: (user: UserTypeWithWorkspaces) => void
): RowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
    role: user.workspaces[0].role as ActiveRoleType,
    onClick: () => onClick(user),
  }));
}

export function MembersList({
  owner,
  currentUserId,
  onInviteClick,
}: {
  owner: WorkspaceType;
  currentUserId: string;
  onInviteClick: () => void;
}) {
  const [searchText, setSearchText] = useState("");
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
      accessorKey: "name",
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
    },
    {
      id: "role",
      cell: (info: Info) => (
        <DataTable.CellContent>
          <Chip
            label={_.capitalize(info.row.original.role)}
            color={ROLES_DATA[info.row.original.role]["color"]}
          />
        </DataTable.CellContent>
      ),
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

  const rows = useMemo(
    () =>
      getTableRows(members, (user: UserTypeWithWorkspaces | null) => {
        setSelectedMember(user);
      }),
    [members]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-2">
        <Searchbar
          placeholder="Search members (email)"
          value={searchText}
          name="search"
          onChange={(s) => {
            setSearchText(s);
          }}
        />
        <Button
          label="Invite members"
          icon={PlusIcon}
          onClick={onInviteClick}
        />
      </div>
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
