import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PluginRunType } from "@app/types";

export function makeColumnsForPluginRuns(): ColumnDef<PluginRunType>[] {
  return [
    {
      accessorKey: "createdAt",
      cell: ({ row }) => {
        return formatTimestampToFriendlyDate(row.original.createdAt);
      },
      header: "Date",
    },
    {
      accessorKey: "author",
      header: "Author",
    },
    {
      accessorKey: "pluginId",
      header: "Plugin",
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      accessorKey: "resourceType",
      header: "Resource Type",
    },
    {
      accessorKey: "resourceId",
      header: "Resource ID",
    },
    {
      accessorFn: (row) => JSON.stringify(row.args, null, 2),
      header: "Args",
      cell: ({ row }) => {
        return <pre>{JSON.stringify(row.original.args, null, 2)}</pre>;
      },
    },
  ];
}
