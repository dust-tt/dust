import {
  Button,
  DataTable,
  Spinner,
  UserGroupIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import assert from "assert";
import { useMemo } from "react";

import type { GroupType } from "@app/types";

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  onClick?: () => void;
  onRemoveGroupClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, unknown>;

const groupColumns = [
  {
    id: "name" as const,
    accessorKey: "name",
    header: "Group name",
    cell: (info: GroupInfo) => (
      <DataTable.CellContent icon={UserGroupIcon} className="capitalize">
        {info.row.original.name}
      </DataTable.CellContent>
    ),
    enableSorting: true,
  },
  {
    id: "memberCount" as const,
    accessorKey: "memberCount",
    header: "Members",
    meta: {
      className: "w-[120px]",
    },
    cell: (info: GroupInfo) => (
      <DataTable.BasicCellContent label={`${info.row.original.memberCount}`} />
    ),
    enableSorting: true,
  },
  {
    id: "action" as const,
    meta: {
      className: "w-[44px]",
    },
    cell: (info: GroupInfo) => {
      return (
        <DataTable.CellContent>
          <Button
            icon={XMarkIcon}
            size="xs"
            variant="ghost-secondary"
            onClick={info.row.original.onRemoveGroupClick}
          />
        </DataTable.CellContent>
      );
    },
  },
];

type GroupColumnIDs = (typeof groupColumns)[number]["id"][];

const filterColumn = (shownColumns: GroupColumnIDs) => {
  return (column: (typeof groupColumns)[number]) => {
    return shownColumns.includes(column.id);
  };
};

type GroupsListProps = {
  searchTerm?: string;
  isLoading?: boolean;
  groups: GroupType[];
  showColumns: GroupColumnIDs;
  onRemoveGroupClick?: (group: GroupType) => void;
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
};

export function GroupsList({
  isLoading,
  groups,
  showColumns,
  onRemoveGroupClick,
  ...tableProps
}: GroupsListProps) {
  assert(
    !showColumns.includes("action") || onRemoveGroupClick,
    "onRemoveGroupClick is required if action is shown"
  );

  const rows = useMemo(() => {
    return groups.map((group) => ({
      groupId: group.sId,
      name: group.name,
      memberCount: group.memberCount,
      onRemoveGroupClick: () => onRemoveGroupClick?.(group),
    }));
  }, [groups, onRemoveGroupClick]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <DataTable
      filterColumn="name"
      data={rows}
      columns={groupColumns.filter(filterColumn(showColumns))}
      columnsBreakpoints={{
        name: "md",
      }}
      {...tableProps}
    />
  );
}
