import { IconButton, LinkWrapper, TrashIcon } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";

interface DataSources {
  connectorProvider: string | null;
  id: number;
  sId: string;
  name: string;
  editedBy: string | undefined;
  editedAt: number | undefined;
}

export function makeColumnsForDataSources(
  owner: WorkspaceType,
  onDeleted: () => Promise<void>
): ColumnDef<DataSources>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return (
          <LinkWrapper href={`/poke/${owner.sId}/data_sources/${sId}`}>
            {sId}
          </LinkWrapper>
        );
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
      accessorKey: "connectorProvider",
      header: "Provider",
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
    {
      id: "actions",
      cell: ({ row }) => {
        const dataSource = row.original;

        return (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="outline"
            onClick={async () => {
              await deleteDataSource(owner, dataSource.sId, onDeleted);
            }}
          />
        );
      },
    },
  ];
}

async function deleteDataSource(
  owner: WorkspaceType,
  dataSourceId: string,
  onDeleted: () => Promise<void>
) {
  if (
    !window.confirm(
      `Are you sure you want to delete the ${dataSourceId} data source? There is no going back.`
    )
  ) {
    return;
  }

  if (!window.confirm(`really, Really, REALLY sure ?`)) {
    return;
  }

  try {
    const r = await fetch(
      `/api/poke/workspaces/${owner.sId}/data_sources/${dataSourceId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      const text = await r.text();

      throw new Error(`Failed to delete data source: ${text}`);
    }

    await onDeleted();
  } catch (e) {
    console.error(e);
    window.alert(e);
  }
}
