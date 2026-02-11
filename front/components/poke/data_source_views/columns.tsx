import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { AgentsUsageType } from "@app/types/data_source";

interface DataSourceView {
  dataSourceLink: string;
  dataSourceName: string;
  dataSourceViewLink: string;
  editedAt: number | undefined;
  editedBy: string | undefined;
  name: string;
  sId: string;
  usage: AgentsUsageType | null;
}

export function makeColumnsForDataSourceViews(): ColumnDef<DataSourceView>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const { dataSourceViewLink, sId } = row.original;

        return <LinkWrapper href={dataSourceViewLink}>{sId}</LinkWrapper>;
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "dataSourceName",
      cell: ({ row }) => {
        const { dataSourceLink, dataSourceName } = row.original;

        return (
          <LinkWrapper href={dataSourceLink}>{dataSourceName}</LinkWrapper>
        );
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Data source" />
      ),
    },
    {
      accessorKey: "usage",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Usage" />
      ),
      cell: ({ row }) => {
        const usage = row.original.usage;
        if (!usage) {
          return (
            <span className="text-gray-400 dark:text-gray-400-night">-</span>
          );
        }
        return (
          <div>
            <span className="font-medium">{usage.count}</span>
            {usage.count > 0 && (
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-500-night">
                (
                {usage.agents
                  .map((a) => a.name)
                  .slice(0, 2)
                  .join(", ")}
                {usage.agents.length > 2 && ", ..."})
              </span>
            )}
          </div>
        );
      },
      sortingFn: (rowA, rowB) => {
        const usageA = rowA.original.usage?.count ?? 0;
        const usageB = rowB.original.usage?.count ?? 0;
        return usageA - usageB;
      },
    },

    {
      accessorKey: "editedBy",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last edited by" />
      ),
    },
    {
      accessorKey: "kind",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Kind" />
      ),
    },
    {
      accessorKey: "editedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last edited at" />
      ),
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
