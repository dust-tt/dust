import { IconButton } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import PokeLink from "@app/components/poke/shadcn/ui/link";
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

        return <PokeLink href={dataSourceViewLink}>{sId}</PokeLink>;
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>sId</p>
            <IconButton
              variant="tertiary"
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

        return <PokeLink href={dataSourceLink}>{dataSourceName}</PokeLink>;
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Data Source</p>
            <IconButton
              variant="tertiary"
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
