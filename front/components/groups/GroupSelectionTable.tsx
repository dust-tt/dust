import { getGroupKindChip } from "@app/components/groups/GroupKinds";
import { useGroups } from "@app/lib/swr/groups";
import type { GroupKind, GroupType } from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  createSelectionColumn,
  DataTable,
  SearchInput,
  Users01,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";

interface GroupRowData {
  sId: string;
  name: string;
  kind: GroupKind;
  memberCount: number;
  onClick?: () => void;
}

function getGroupTableRows(groups: GroupType[]): GroupRowData[] {
  return groups.map((group) => ({
    sId: group.sId,
    name: group.name,
    kind: group.kind,
    memberCount: group.memberCount,
  }));
}

interface GroupSelectionTableProps {
  owner: LightWorkspaceType;
  selectedGroupIds: Set<string>;
  onSelectionChange: (ids: Set<string>, groups: GroupType[]) => void;
}

export function GroupSelectionTable({
  owner,
  selectedGroupIds,
  onSelectionChange,
}: GroupSelectionTableProps) {
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
  });

  const groupMapRef = useRef(new Map<string, GroupType>());

  useEffect(() => {
    for (const group of groups) {
      if (!groupMapRef.current.has(group.sId)) {
        groupMapRef.current.set(group.sId, group);
      }
    }
  }, [groups]);

  const filteredGroups = useMemo(() => {
    if (!searchText) {
      return groups;
    }
    const lowerSearch = searchText.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(lowerSearch));
  }, [groups, searchText]);

  const rows = useMemo(
    () => getGroupTableRows(filteredGroups),
    [filteredGroups]
  );

  const rowSelectionState: RowSelectionState = useMemo(
    () =>
      Object.fromEntries(Array.from(selectedGroupIds, (sId) => [sId, true])),
    [selectedGroupIds]
  );

  const handleRowSelectionChange = (newSelection: RowSelectionState) => {
    const newIds = new Set(
      Object.entries(newSelection)
        .filter(([, selected]) => selected)
        .map(([sId]) => sId)
    );

    const resolvedGroups: GroupType[] = [];
    for (const sId of newIds) {
      const group = groupMapRef.current.get(sId);
      if (group) {
        resolvedGroups.push(group);
      }
    }

    onSelectionChange(newIds, resolvedGroups);
  };

  const columns: ColumnDef<GroupRowData>[] = useMemo(
    () => [
      createSelectionColumn<GroupRowData>(),
      {
        accessorKey: "name",
        header: "Name",
        id: "name",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info: CellContext<GroupRowData, unknown>) => {
          const { name, memberCount } = info.row.original;
          return (
            <DataTable.CellContent
              icon={Users01}
              description={`${memberCount} member${pluralize(memberCount)}`}
            >
              {name}
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "kind",
        header: "",
        meta: { className: "w-[160px]" },
        cell: (info: CellContext<GroupRowData, unknown>) => {
          const { label, color } = getGroupKindChip(info.row.original.kind);
          return (
            <DataTable.CellContent>
              <Chip size="xs" color={color} label={label} />
            </DataTable.CellContent>
          );
        },
      },
    ],
    []
  );

  return (
    <>
      <SearchInput
        name="group-search"
        value={searchText}
        onChange={handleSearchChange}
        placeholder="Search groups..."
        className="mt-2"
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {isGroupsLoading ? (
          <div className="flex items-center justify-center p-4">
            <span className="text-sm text-muted-foreground">
              Loading groups...
            </span>
          </div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            pagination={pagination}
            setPagination={setPagination}
            totalRowCount={filteredGroups.length}
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
