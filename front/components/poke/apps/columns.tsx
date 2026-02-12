import {
  ArrowDownOnSquareIcon,
  IconButton,
  LinkWrapper,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { getApiBaseUrl } from "@app/lib/egress/client";
import type { AppType } from "@app/types/app";
import type { LightWorkspaceType } from "@app/types/user";

export function makeColumnsForApps(
  owner: LightWorkspaceType
): ColumnDef<AppType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const { space, sId } = row.original;

        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/spaces/${space.sId}/apps/${sId}`}
          >
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
      accessorKey: "description",
      header: "Description",
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const app = row.original;

        return (
          <>
            <a
              href={`${getApiBaseUrl()}/api/poke/workspaces/${owner.sId}/apps/${app.sId}/export`}
              download={`${app.name}.json`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconButton
                icon={ArrowDownOnSquareIcon}
                size="xs"
                variant="outline"
              />
            </a>
          </>
        );
      },
    },
  ];
}
