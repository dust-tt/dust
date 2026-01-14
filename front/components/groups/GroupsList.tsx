import {
  Button,
  Checkbox,
  DataTable,
  Spinner,
  UserGroupIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import assert from "assert";
import { useCallback, useMemo } from "react";

import type { SpaceGroupType } from "@app/types";

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  isEditor?: boolean;
  onClick?: () => void;
  onRemoveGroupClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, unknown>;

export type GroupsListProps = {
  searchTerm?: string;
  isLoading?: boolean;
  groups: SpaceGroupType[];
  showColumns: ("name" | "memberCount" | "isEditor" | "action")[];
  onToggleEditor: (groupId: string) => void;
  onRemoveGroupClick?: (group: SpaceGroupType) => void;
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
  disabled?: boolean;
};

export function GroupsList({
  isLoading,
  groups,
  showColumns,
  onToggleEditor,
  onRemoveGroupClick,
  disabled,
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
      isEditor: group.isEditor,
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

  const getTableColumns = useCallback(() => {
    return [
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
          <DataTable.BasicCellContent
            label={`${info.row.original.memberCount}`}
          />
        ),
        enableSorting: true,
      },
      {
        id: "isEditor" as const,
        accessorKey: "isEditor",
        header: "Editor",
        meta: {
          className: "w-20",
        },
        cell: (info: GroupInfo) => (
          <DataTable.CellContent>
            <Checkbox
              checked={info.row.original.isEditor ?? false}
              onCheckedChange={() => onToggleEditor(info.row.original.groupId)}
              disabled={disabled}
            />
          </DataTable.CellContent>
        ),
        enableSorting: false,
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
    ].filter((column) => showColumns.includes(column.id));
  }, [showColumns]);

  const columns = useMemo(() => getTableColumns(), [getTableColumns]);

  return (
    <DataTable
      filterColumn="name"
      data={rows}
      columns={columns}
      columnsBreakpoints={{
        name: "md",
      }}
      {...tableProps}
    />
  );
}
