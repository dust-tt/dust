import { IconButton, TrashIcon } from "@dust-tt/sparkle";
import type {
  AgentConfigurationType,
  DataSourceType,
  DataSourceViewType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
} from "@dust-tt/types";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import PokeLink from "@app/components/poke/shadcn/ui/link";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

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
  agentConfigurations: AgentConfigurationType[],
  dataSourcesWithViews: {
    dataSource: DataSourceType;
    dataSourceViews: DataSourceViewType[];
  }[],
  reload: () => void
): ColumnDef<DataSources>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return (
          <PokeLink href={`/poke/${owner.sId}/data_sources/${sId}`}>
            {sId}
          </PokeLink>
        );
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
        const dataSourceViews = dataSourcesWithViews.find(
          (v) => v.dataSource.sId === dataSource.sId
        )?.dataSourceViews;
        if (!dataSourceViews) {
          return null;
        }

        return (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="tertiary"
            onClick={async () => {
              await deleteDataSource(
                owner,
                dataSource.sId,
                agentConfigurations,
                dataSourceViews,
                reload
              );
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
  agentConfigurations: AgentConfigurationType[],
  dataSourceViews: DataSourceViewType[],
  reload: () => void
) {
  const agents = agentConfigurations.filter((agt) =>
    agt.actions.some(
      (a) =>
        ((isRetrievalConfiguration(a) || isProcessConfiguration(a)) &&
          a.dataSources.some((ds) =>
            dataSourceViews.some((dsv) => dsv.sId === ds.dataSourceViewId)
          )) ||
        (isTablesQueryConfiguration(a) &&
          a.tables.some((t) =>
            dataSourceViews.some((dsv) => dsv.sId === t.dataSourceViewId)
          ))
    )
  );

  if (agents.length > 0) {
    window.alert(
      "Please archive agents using this data source first: " +
        agents.map((a) => a.name).join(", ")
    );
    return;
  }
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
      throw new Error("Failed to delete data source.");
    }
    reload();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while deleting the data source.");
  }
}
