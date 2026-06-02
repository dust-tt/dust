import { useSearchMembers } from "@app/lib/swr/memberships";
import type {
  LightUserType,
  LightWorkspaceType,
  UserTypeWithWorkspace,
} from "@app/types/user";
import {
  Avatar,
  createSelectionColumn,
  DataTable,
  SearchInput,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";

export type SearchMemberType = LightUserType | UserTypeWithWorkspace;

export function hasFullUserAccess(
  user: SearchMemberType
): user is UserTypeWithWorkspace {
  return "email" in user;
}

export interface MemberRowData {
  sId: string;
  fullName: string;
  image: string;
  email?: string;
  onClick?: () => void;
}

function getMemberTableRows(members: SearchMemberType[]): MemberRowData[] {
  return members.map((user) => ({
    sId: user.sId,
    fullName: user.fullName,
    image: user.image ?? "",
    email: hasFullUserAccess(user) ? user.email : undefined,
  }));
}

interface MemberSelectionTableProps {
  owner: LightWorkspaceType;
  selectedMemberIds: Set<string>;
  onSelectionChange: (ids: Set<string>, users: SearchMemberType[]) => void;
  extraColumns?: ColumnDef<MemberRowData>[];
  buildersOnly?: boolean;
  initialMembers?: SearchMemberType[];
}

export function MemberSelectionTable({
  owner,
  selectedMemberIds,
  onSelectionChange,
  extraColumns,
  buildersOnly,
  initialMembers,
}: MemberSelectionTableProps) {
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const { members, totalMembersCount, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    buildersOnly,
    disabled: !searchText,
  });

  // Internal map to resolve sId -> SearchMemberType, seeded with initialMembers
  // and updated as search results come in.
  const userMapRef = useRef(
    new Map<string, SearchMemberType>(
      (initialMembers ?? []).map((m) => [m.sId, m])
    )
  );

  // Update the map synchronously so downstream memos read fresh data.
  for (const member of members) {
    if (!userMapRef.current.has(member.sId)) {
      userMapRef.current.set(member.sId, member);
    }
  }

  // When not searching, show selected members; when searching, show search results.
  const rows = useMemo(() => {
    if (!searchText) {
      const selectedUsers = Array.from(selectedMemberIds)
        .map((sId) => userMapRef.current.get(sId))
        .filter((u): u is SearchMemberType => !!u);
      return getMemberTableRows(selectedUsers);
    }
    return getMemberTableRows(members);
  }, [searchText, selectedMemberIds, members]);

  const rowSelectionState: RowSelectionState = useMemo(
    () =>
      Object.fromEntries(Array.from(selectedMemberIds, (sId) => [sId, true])),
    [selectedMemberIds]
  );

  const handleRowSelectionChange = (newSelection: RowSelectionState) => {
    const newIds = new Set(
      Object.entries(newSelection)
        .filter(([, selected]) => selected)
        .map(([sId]) => sId)
    );

    const users: SearchMemberType[] = [];
    for (const sId of newIds) {
      const user = userMapRef.current.get(sId);
      if (user) {
        users.push(user);
      }
    }

    onSelectionChange(newIds, users);
  };

  const columns: ColumnDef<MemberRowData>[] = useMemo(() => {
    return [
      createSelectionColumn<MemberRowData>({
        hideSelectAll: !!searchText && rows.length <= 1,
      }),
      {
        accessorKey: "fullName",
        header: "Name",
        id: "fullName",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info: CellContext<MemberRowData, unknown>) => {
          const { fullName, image, email } = info.row.original;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <Avatar
                  name={fullName}
                  visual={image || undefined}
                  size="xs"
                  isRounded
                />
                <div className="flex flex-col">
                  <span className="text-sm">{fullName}</span>
                  {email && (
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      {email}
                    </span>
                  )}
                </div>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      ...(extraColumns ?? []),
    ];
  }, [extraColumns, rows.length, searchText]);

  return (
    <>
      <SearchInput
        name="member-search"
        value={searchText}
        onChange={handleSearchChange}
        placeholder="Search users..."
        className="mt-2"
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Loading users...
            </span>
          </div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            pagination={pagination}
            setPagination={setPagination}
            totalRowCount={searchText ? totalMembersCount : rows.length}
            rowSelection={rowSelectionState}
            setRowSelection={handleRowSelectionChange}
            enableRowSelection
            getRowId={(row) => row.sId}
          />
        )}
      </div>
    </>
  );
}
