import { IconButton } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import type { WhitelistableFeature } from "@app/types";
import { dateToHumanReadable } from "@app/types";

type FeatureFlagsDisplayType = {
  name: WhitelistableFeature;
  enabled: boolean;
  enabledAt: string | null;
};

export function makeColumnsForFeatureFlags(): ColumnDef<FeatureFlagsDisplayType>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Name</p>
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
      accessorKey: "enabled",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Status</p>
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
      cell: ({ row }) => {
        const { enabled } = row.original;
        return (
          <span
            className={`font-medium ${enabled ? "text-green-600" : "text-gray-400"}`}
          >
            {enabled ? "✅ Enabled" : "❌ Disabled"}
          </span>
        );
      },
    },
    {
      accessorKey: "enabledAt",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Enabled Date</p>
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
      cell: ({ row }) => {
        const { enabledAt } = row.original;
        if (!enabledAt) {
          return <span className="text-gray-400">—</span>;
        }

        try {
          const date = new Date(enabledAt);
          return <span className="text-sm">{dateToHumanReadable(date)}</span>;
        } catch {
          return <span className="text-gray-400">Invalid date</span>;
        }
      },
    },
  ];
}
