import { removeNulls } from "@dust-tt/client";
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
import React, { useMemo } from "react";

import { AddActionMenu } from "@app/components/actions/mcp/AddActionMenu";
import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  DEFAULT_MCP_SERVER_ICON,
  MCP_SERVER_ICONS,
} from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { MCPServerViewType } from "@app/lib/resources/mcp_server_view_resource";
import {
  useAddMCPServerToSpace,
  useRemoveMCPServerViewFromSpace,
} from "@app/lib/swr/mcp_server_views";
import {
  useDeleteMCPServer,
  useMCPServerConnections,
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
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
  openRemoteMCPCreationModal: () => void;
};

export const AdminActionsList = ({
  owner,
  setShowDetails,
  openRemoteMCPCreationModal,
}: AdminActionsListProps) => {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { addToSpace } = useAddMCPServerToSpace(owner);
  const { removeFromSpace } = useRemoveMCPServerViewFromSpace(owner);
  const { deleteServer } = useDeleteMCPServer(owner);

  const systemSpace = useMemo(() => {
    return spaces.find((space) => space.kind === "system");
  }, [spaces]);

  const availableSpaces = (spaces ?? []).filter((s) => s.kind !== "system");
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
  });
  const { mcpServers, mutateMCPServers, isMCPServersLoading } = useMCPServers({
    owner,
    filter: "all",
  });

  const serverViews = useMemo(
    () =>
      removeNulls(
        mcpServers
          .map((s) => s.views?.filter((v) => v.spaceId === systemSpace?.sId))
          .flat()
      ),
    [mcpServers, systemSpace]
  );

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
                  MCP_SERVER_ICONS[
                    info.getValue().server.icon || DEFAULT_MCP_SERVER_ICON
                  ]
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
      cell: (info: CellContext<RowData, SpaceType[]>) => {
        const spaces = info
          .getValue()
          .filter((v) => v.kind !== "system")
          .map((v) => v.name);

        return (
          <DataTable.BasicCellContent
            className="justify-end"
            label={spaces.length > 0 ? spaces.join(", ") : "-"}
            tooltip={spaces.length > 0 ? spaces.join(", ") : "-"}
          />
        );
      },
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

  const rows: RowData[] = serverViews.map((serverView) => {
    const { serverType } = getServerTypeAndIdFromSId(serverView.server.id);

    const linkedServerViews = mcpServers.find(
      (s) => s.id === serverView.server.id
    )?.views;

    const linkedSpaces = removeNulls(
      linkedServerViews?.map((v) => spaces.find((s) => s.sId === v.spaceId)) ||
        []
    );

    const groupedSpaces = Object.groupBy(availableSpaces, ({ sId }) =>
      linkedSpaces.find((s) => s.sId === sId) ? "included" : "available"
    );

    return {
      serverView,
      spaces: linkedSpaces,
      onClick: () => {
        setShowDetails(serverView.server);
      },
      actions: [
        {
          disabled:
            !groupedSpaces.available || groupedSpaces.available.length === 0,
          kind: "submenu",
          label: "Add to space",
          items: (groupedSpaces.available || []).map((s) => ({
            id: s.sId,
            name: s.name,
          })),
          onSelect: async (spaceId) => {
            const space = availableSpaces.find((s) => s.sId === spaceId);
            if (!space) {
              throw new Error("Space not found");
            }
            await addToSpace(serverView.server, space);
            await mutateMCPServers();
          },
        },
        {
          disabled:
            !groupedSpaces.included || groupedSpaces.included.length === 0,
          kind: "submenu",
          label: "Remove from space",
          items: (groupedSpaces.included || []).map((s) => ({
            id: s.sId,
            name: s.name,
          })),
          onSelect: async (spaceId) => {
            const space = availableSpaces.find((s) => s.sId === spaceId);
            if (!space) {
              throw new Error("Space not found");
            }

            const viewToDelete = linkedServerViews?.find(
              (v) => v.spaceId === spaceId
            );
            if (viewToDelete) {
              await removeFromSpace(viewToDelete, space);
              await mutateMCPServers();
            }
          },
        },
        {
          kind: "item",
          label: "Edit",
          onSelect: () => {
            setShowDetails(serverView.server);
          },
        },
        {
          kind: "item",
          label: serverType === "internal" ? "Disable" : "Delete",
          onSelect: async () => {
            await deleteServer(serverView.server.id);
          },
        },
      ],
    };
  });
  const columns = getTableColumns();

  return (
    <div>
      <div className="mb-4 flex h-9 w-full items-center justify-between gap-2">
        <div />
        <AddActionMenu
          owner={owner}
          enabledMCPServers={serverViews.map(
            (serverView) => serverView.server.id
          )}
          createRemoteMCP={openRemoteMCPCreationModal}
        />
      </div>

      {isConnectionsLoading || isMCPServersLoading ? (
        <div className="mt-16 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <DataTable data={rows} columns={columns} className="pb-4" />
      )}
    </div>
  );
};
