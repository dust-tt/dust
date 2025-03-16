import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { TrackerConfigurationType, WorkspaceType } from "@app/types";

export function makeColumnsForTrackers(
  owner: WorkspaceType
): ColumnDef<TrackerConfigurationType>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          href={`/poke/${owner.sId}/trackers/${row.original.sId}`}
          className="text-action-500 hover:text-action-300"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "frequency",
      header: "Frequency",
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      cell: ({ row }) =>
        row.original
          ? formatTimestampToFriendlyDate(row.original.createdAt)
          : "N/A",
    },
  ];
}
