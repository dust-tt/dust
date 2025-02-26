import type { MenuItem } from "@dust-tt/sparkle";
import { DataTable } from "@dust-tt/sparkle";
import type { DataSourceViewContentNode } from "@dust-tt/types";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";

type RowData = DataSourceViewContentNode & {
  icon: React.ComponentType;
  onClick?: () => void;
  menuItems?: MenuItem[];
};

export function makeColumnsForSearchResults(): ColumnDef<RowData>[] {
  const columns: ColumnDef<RowData, any>[] = [];
  columns.push({
    header: "Name",
    accessorKey: "title",
    id: "title",
    sortingFn: "text", // built-in sorting function case-insensitive
    cell: (info: CellContext<RowData, string>) => (
      <DataTable.CellContent icon={info.row.original.icon}>
        <span>{info.getValue()}</span>
      </DataTable.CellContent>
    ),
  });

  columns.push({
    header: "Last updated",
    id: "lastUpdatedAt",
    accessorKey: "lastUpdatedAt",
    meta: {
      className: "w-20",
    },
    cell: (info: CellContext<RowData, number>) => (
      <DataTable.BasicCellContent
        className="justify-end"
        label={
          info.getValue()
            ? formatTimestampToFriendlyDate(info.getValue(), "compact")
            : "-"
        }
      />
    ),
  });

  columns.push({
    id: "actions",
    meta: {
      className: "flex justify-end items-center",
    },
    cell: (info) =>
      info.row.original.menuItems && (
        <DataTable.MoreButton menuItems={info.row.original.menuItems} />
      ),
  });

  return columns;
}
