import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";

interface DataSourceView {
  dataSourceLink: string;
  dataSourceName: string;
  dataSourceViewLink: string;
  editedAt: number | undefined;
  editedBy: string | undefined;
  name: string;
  sId: string;
}

export function makeColumnsForDataSourceViews(): ColumnDef<DataSourceView>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const { dataSourceViewLink, sId } = row.original;

        return <LinkWrapper href={dataSourceViewLink}>{sId}</LinkWrapper>;
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>sId</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "dataSourceName",
      cell: ({ row }) => {
        const { dataSourceLink, dataSourceName } = row.original;

        return (
          <LinkWrapper href={dataSourceLink}>{dataSourceName}</LinkWrapper>
        );
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Data Source</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "editedBy",
      header: "Last edited by",
    },
    {
      accessorKey: "kind",
      header: "Kind",
    },
    {
      accessorKey: "editedAt",
      header: "Last edited at",
      cell: ({ row }) => {
        const editedAt: number | undefined = row.getValue("editedAt");

        if (!editedAt) {
          return "";
        }

        return formatTimestampToFriendlyDate(editedAt);
      },
    },
  ];
}
