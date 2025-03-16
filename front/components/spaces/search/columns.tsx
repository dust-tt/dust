import type { MenuItem } from "@dust-tt/sparkle";
import { DataTable, Tooltip } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { DataSourceViewContentNode } from "@app/types";

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
          <Tooltip
            label={info.getValue()}
            trigger={<span>{info.getValue()}</span>}
          />
        </DataTable.CellContent>
      ),
      meta: {
        sizeRatio: 50,
      },
    },
    {
      header: "Location",
      accessorKey: "location",
      id: "location",
      enableSorting: false,
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.BasicCellContent label={info.getValue()} className="pr-2" />
      ),
      meta: {
        sizeRatio: 25,
      },
    },
    {
      header: "Last updated",
      id: "lastUpdatedAt",
      accessorKey: "lastUpdatedAt",
      enableSorting: false,
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
      meta: {
        sizeRatio: 15,
      },
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: "Actions",
      enableSorting: false,
      meta: {
        sizeRatio: 10,
      },
      cell: (info) =>
        info.row.original.menuItems && (
          <DataTable.MoreButton menuItems={info.row.original.menuItems} />
        ),
    },
  ];
}
