import { useSearchMembers } from "@app/lib/swr/memberships";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  createSelectionColumn,
  DataTable,
  SearchInput,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  RowSelectionState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";

export interface MemberRowData {
  sId: string;
  fullName: string;
  email: string;
  image: string;
  onClick?: () => void;
}

function getMemberTableRows(
  members: Pick<UserType, "sId" | "fullName" | "email" | "image">[]
): MemberRowData[] {
  return members.map((user) => ({
    sId: user.sId,
    fullName: user.fullName,
    email: user.email ?? "",
    image: user.image ?? "",
  }));
}

interface MemberSelectionTableProps {
  owner: LightWorkspaceType;
  selectedMemberIds: Set<string>;
  onSelectionChange: (ids: Set<string>, users: UserType[]) => void;
  extraColumns?: ColumnDef<MemberRowData>[];
  buildersOnly?: boolean;
  initialMembers?: UserType[];
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

  const { members, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: 100,
    buildersOnly,
  });

  // Internal map to resolve sId -> UserType, seeded with initialMembers and
  // updated as search results come in.
  const userMapRef = useRef(
    new Map<string, UserType>((initialMembers ?? []).map((m) => [m.sId, m]))
  );

  useEffect(() => {
    for (const member of members) {
      if (!userMapRef.current.has(member.sId)) {
        userMapRef.current.set(member.sId, member);
      }
    }
  }, [members]);

  const rows = useMemo(() => getMemberTableRows(members), [members]);

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

    const users: UserType[] = [];
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
      createSelectionColumn<MemberRowData>(),
      {
        accessorKey: "fullName",
        header: "Name",
        id: "fullName",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info: CellContext<MemberRowData, unknown>) => (
          <DataTable.CellContent
            avatarUrl={info.row.original.image}
            roundedAvatar
            description={info.row.original.email}
          >
            {info.row.original.fullName}
          </DataTable.CellContent>
        ),
      },
      ...(extraColumns ?? []),
    ];
  }, [extraColumns]);

  return (
    <>
      <SearchInput
        name="member-search"
        value={searchText}
        onChange={setSearchText}
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
            rowSelection={rowSelectionState}
            setRowSelection={handleRowSelectionChange}
            enableRowSelection
            getRowId={(row) => row.sId}
            filter={searchText}
            filterColumn="fullName"
          />
        )}
      </div>
    </>
  );
}
