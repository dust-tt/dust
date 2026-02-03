import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

type SkillDisplayType = Pick<
  SkillType,
  "sId" | "name" | "status" | "createdAt" | "updatedAt"
>;

export function makeColumnsForSkills(
  owner: LightWorkspaceType
): ColumnDef<SkillDisplayType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return (
          <LinkWrapper href={`/poke/${owner.sId}/skills/${sId}`}>
            {sId}
          </LinkWrapper>
        );
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
      cell: ({ row }) => {
        const createdAt: number | null = row.getValue("createdAt");
        return createdAt ? formatTimestampToFriendlyDate(createdAt) : null;
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Updated at" />
      ),
      cell: ({ row }) => {
        const updatedAt: number | null = row.getValue("updatedAt");
        return updatedAt ? formatTimestampToFriendlyDate(updatedAt) : null;
      },
    },
  ];
}
