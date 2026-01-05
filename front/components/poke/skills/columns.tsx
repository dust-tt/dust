import { IconButton } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SkillType } from "@app/types/assistant/skill_configuration";

type SkillDisplayType = Pick<
  SkillType,
  "sId" | "name" | "status" | "createdAt" | "updatedAt"
>;

export function makeColumnsForSkills(): ColumnDef<SkillDisplayType>[] {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
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
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
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
      accessorKey: "status",
      header: "Status",
    },
    {
      accessorKey: "createdAt",
      header: "Created at",
      cell: ({ row }) => {
        const createdAt: number | null = row.getValue("createdAt");
        return createdAt ? formatTimestampToFriendlyDate(createdAt) : null;
      },
    },
    {
      accessorKey: "updatedAt",
      header: "Updated at",
      cell: ({ row }) => {
        const updatedAt: number | null = row.getValue("updatedAt");
        return updatedAt ? formatTimestampToFriendlyDate(updatedAt) : null;
      },
    },
  ];
}
