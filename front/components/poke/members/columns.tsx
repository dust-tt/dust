import { IconButton, TrashIcon } from "@dust-tt/sparkle";
import type { RoleType } from "@dust-tt/types";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";

export type MemberDisplayType = {
  createdAt: number;
  email: string;
  name: string;
  provider: string | null;
  role: RoleType;
  sId: string;
};

export function makeColumnsForMembers({
  onRevokeMember,
}: {
  onRevokeMember: (m: MemberDisplayType) => Promise<void>;
}): ColumnDef<MemberDisplayType>[] {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
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
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Name</p>
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
      accessorKey: "email",
      header: "email",
    },
    {
      accessorKey: "provider",
      header: "Provider",
    },
    {
      accessorKey: "createdAt",
      header: "Created at",
      cell: ({ row }) => {
        const createdAt: string | null = row.getValue("createdAt");

        if (!createdAt) {
          return;
        }

        return formatTimestampToFriendlyDate(new Date(createdAt).getTime());
      },
    },
    {
      accessorKey: "role",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Role</p>
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
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const member = row.original;

        return (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="tertiary"
            onClick={async () => {
              await onRevokeMember(member);
            }}
          />
        );
      },
    },
  ];
}
