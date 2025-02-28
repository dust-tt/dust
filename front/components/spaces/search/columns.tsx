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

export function makeColumnsForSearchResults(): ColumnDef<RowData, any>[] {
  return [
    {
      header: "Name",
      accessorKey: "title",
      id: "title",
      enableSorting: false,
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          <span>{info.getValue()}</span>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-3/6",
      },
    },
    {
      header: "Location",
      accessorKey: "location",
      id: "location",
      enableSorting: false,
      meta: {
        className: "w-2/6",
      },
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.BasicCellContent label={info.getValue()} />
      ),
    },
    {
      header: "Last updated",
      id: "lastUpdatedAt",
      accessorKey: "lastUpdatedAt",
      enableSorting: false,
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
    },
    {
      id: "actions",
      enableSorting: false,
      meta: {
        className: "flex justify-end items-center w-12",
      },
      cell: (info) =>
        info.row.original.menuItems && (
          <DataTable.MoreButton menuItems={info.row.original.menuItems} />
        ),
    },
  ];
}
