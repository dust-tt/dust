import type { MenuItem } from "@dust-tt/sparkle";
import {
  Avatar,
  Button,
  classNames,
  Cog6ToothIcon,
  DataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React from "react";

import { AddActionMenu } from "@app/components/actions/mcp/AddActionMenu";
import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import { MCP_SERVER_ICONS } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { MCPServerViewType } from "@app/lib/resources/mcp_server_view_resource";
import {
  useAddMCPServerToSpace,
  useMCPServerViews,
} from "@app/lib/swr/mcp_server_views";
import { useMCPServerConnections } from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type RowData = {
  serverView: MCPServerViewType;
  spaces: SpaceType[];
  onClick: () => void;
  actions: MenuItem[];
};

type AdminActionsListProps = {
  owner: LightWorkspaceType;
  setShowDetails: (mcpServer: MCPServerType) => void;
};

export const AdminActionsList = ({
  owner,
  setShowDetails,
}: AdminActionsListProps) => {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { addToSpace } = useAddMCPServerToSpace(owner);

  const systemSpace = (spaces ?? []).find((space) => space.kind === "system");
  const availableSpaces = (spaces ?? []).filter((s) => s.kind !== "system");
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
  });
  const { serverViews, isMCPServerViewsLoading } = useMCPServerViews({
    owner,
    space: systemSpace,
  });

  const { createAndSaveMCPServerConnection, deleteMCPServerConnection } =
    useMCPConnectionManagement({ owner });

  const getTableColumns = (): ColumnDef<RowData>[] => {
    const columns: ColumnDef<RowData, any>[] = [];

    columns.push({
      id: "name",
      header: "Name",
      accessorKey: "serverView",
      sortingFn: (a, b) =>
        a.original.serverView.server.name.localeCompare(
          b.original.serverView.server.name
        ),
      cell: (info: CellContext<RowData, MCPServerViewType>) => (
        <DataTable.CellContent>
          <div className={classNames("flex flex-row items-center gap-2 py-3")}>
            <div>
              <Avatar
                visual={React.createElement(
                  MCP_SERVER_ICONS[info.getValue().server.icon || "Rocket"]
                )}
              />
            </div>
            <div className="flex min-w-0 grow flex-col">
              <div className="overflow-hidden truncate text-sm font-semibold text-foreground dark:text-foreground-night">
                {info.getValue().server.name}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                {info.getValue().server.description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
    });

    columns.push({
      id: "spaces",
      accessorKey: "spaces",
      meta: {
        className: "w-48",
      },
      header: () => {
        return (
          <div className="flex w-full justify-end">
            <p>Available to</p>
          </div>
        );
      },
      cell: (info: CellContext<RowData, SpaceType[]>) => (
        <DataTable.BasicCellContent
          className="justify-end"
          label={
            info.getValue().length > 0
              ? info
                  .getValue()
                  .map((v) => v.name)
                  .join(", ")
              : "-"
          }
          tooltip={
            info.getValue().length > 0
              ? info
                  .getValue()
                  .map((v) => v.name)
                  .join(", ")
              : "-"
          }
        />
      ),
    });

    columns.push({
      id: "connection",
      accessorKey: "serverView.server",
      header: "",
      enableSorting: false,
      cell: (info: CellContext<RowData, MCPServerType>) => {
        const { id, authorization } = info.getValue();
        const connection = connections.find(
          (c) => c.internalMCPServerId === id
        );

        if (!authorization) {
          return null;
        }

        return connection ? (
          <DataTable.CellContent>
            <Button
              variant="warning"
              disabled={isConnectionsLoading}
              icon={Cog6ToothIcon}
              label={"Disconnect"}
              size="xs"
              onClick={() => {
                void deleteMCPServerConnection({
                  connectionId: connection.sId,
                });
              }}
            />
          </DataTable.CellContent>
        ) : (
          <DataTable.CellContent>
            <Button
              variant="outline"
              disabled={isConnectionsLoading}
              icon={Cog6ToothIcon}
              label={"Connect"}
              size="xs"
              onClick={() => {
                void createAndSaveMCPServerConnection({
                  authorizationInfo: authorization,
                  mcpServerId: id,
                });
              }}
            />
          </DataTable.CellContent>
        );
      },
      meta: {
        className: "w-36",
      },
    });

    columns.push({
      id: "actions",
      accessorKey: "actions",
      header: "",
      enableSorting: false,
      meta: {
        className: "w-12",
      },
      cell: (info: CellContext<RowData, MenuItem[]>) =>
        info.getValue() && (
          <DataTable.CellContent>
            <DataTable.MoreButton menuItems={info.getValue()} />
          </DataTable.CellContent>
        ),
    });

    return columns;
  };
  const rows: RowData[] = serverViews.map((serverView) => ({
    serverView,
    spaces: [],
    onClick: () => {
      setShowDetails(serverView.server);
    },
    moreActions: [
      {
        label: "Delete",
        onClick: () => {},
      },
    ],
    actions: [
      {
        disabled: availableSpaces.length === 0,
        kind: "submenu",
        label: "Add to space",
        items: availableSpaces.map((s) => ({
          id: s.sId,
          name: s.name,
        })),
        onSelect: (spaceId) => {
          const space = availableSpaces.find((s) => s.sId === spaceId);
          if (!space) {
            throw new Error("Space not found");
          }
          void addToSpace(serverView.server, space);
        },
      },
      {
        disabled: availableSpaces.length === 0,
        kind: "item",
        label: "Disable",
        onSelect: () => {
          console.log("disable");
        },
      },
    ],
  }));
  const columns = getTableColumns();

  return (
    <div>
      <div className="mb-4 flex h-9 w-full items-center justify-between gap-2">
        <div />
        <AddActionMenu
          owner={owner}
          enabledMCPServers={serverViews.map(
            //TODO(mcp) serverView.server.id or serverView.id?
            (serverView) => serverView.server.id
          )}
        />
      </div>

      {isConnectionsLoading || isMCPServerViewsLoading ? (
        <div className="mt-16 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <DataTable data={rows} columns={columns} className="pb-4" />
      )}
    </div>
  );
};
