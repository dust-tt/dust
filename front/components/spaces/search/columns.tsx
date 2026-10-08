import { formatTimestampToFriendlyDate } from "@app/lib/client/friendly_date";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { MenuItem } from "@dust-tt/sparkle";
import { DataTable, Tooltip } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

type RowData = DataSourceViewContentNode & {
  icon: React.ComponentType;
  onClick?: () => void;
  menuItems?: MenuItem[];
};

export const SORTING_KEYS: Record<string, string> = {
  title: "title",
  lastUpdatedAt: "timestamp",
};

export function makeColumnsForSearchResults(): ColumnDef<RowData, any>[] {
  return [
    {
      header: () => <Trans>Name</Trans>,
      accessorKey: "title",
      id: "title",
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
      header: () => <Trans>Location</Trans>,
      accessorKey: "location",
      id: "location",
      enableSorting: false,
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.BasicCellContent
          label={
            // Displaying data source name for folders
            info.row.original.dataSourceView.category === "folder"
              ? info.row.original.dataSourceView.dataSource.name
              : info.getValue()
          }
          className="pr-2"
        />
      ),
      meta: {
        sizeRatio: 20,
      },
    },
    {
      header: () => <Trans>Last updated</Trans>,
      id: "lastUpdatedAt",
      accessorKey: "lastUpdatedAt",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          className="justify-end"
          label={
            info.getValue()
              ? formatTimestampToFriendlyDate(info.getValue(), "short")
              : "-"
          }
        />
      ),
      meta: {
        sizeRatio: 20,
      },
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: () => <Trans>Actions</Trans>,
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
