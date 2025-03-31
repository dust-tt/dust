import type { MenuItem } from "@dust-tt/sparkle";
import {
  Avatar,
  Button,
  classNames,
  Cog6ToothIcon,
  CommandLineIcon,
  DataTable,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React from "react";

import { AddActionMenu } from "@app/components/actions/mcp/AddActionMenu";
import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";
import { MCP_SERVER_ICONS } from "@app/lib/actions/mcp_icons";
import {
  useMCPServerConnections,
  useMCPServerViews,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type RowData = {
  mcpServer: MCPServerMetadata;
  spaces: SpaceType[];
  onClick: () => void;
  actions: MenuItem[];
};

export const ActionsList = ({ owner }: { owner: LightWorkspaceType }) => {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const systemSpace = (spaces ?? []).find((space) => space.kind === "system");
  const availableSpaces = (spaces ?? []).filter((s) => s.kind !== "system");
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
  });
  const { mcpServers, isMCPServersLoading } = useMCPServerViews({
    owner,
    space: systemSpace,
    filter: "all",
  });

  const { createAndSaveMCPServerConnection, deleteMCPServerConnection } =
    useMCPConnectionManagement({ owner });

  const getTableColumns = (): ColumnDef<RowData>[] => {
    const columns: ColumnDef<RowData, any>[] = [];

    columns.push({
      id: "name",
      header: "Name",
      sortingFn: (a, b) =>
        a.original.mcpServer.name.localeCompare(b.original.mcpServer.name),
      cell: (info: CellContext<RowData, MCPServerMetadata>) => (
        <DataTable.CellContent>
          <div className={classNames("flex flex-row items-center gap-2 py-3")}>
            <div>
              <Avatar
                visual={React.createElement(
                  MCP_SERVER_ICONS[info.getValue().icon || "Rocket"]
                )}
              />
            </div>
            <div className="flex min-w-0 grow flex-col">
              <div className="overflow-hidden truncate text-sm font-semibold text-foreground dark:text-foreground-night">
                {info.getValue().name}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                {info.getValue().description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      accessorKey: "mcpServer",
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
      header: "",
      enableSorting: false,
      cell: (info: CellContext<RowData, MCPServerMetadata>) => {
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
      accessorKey: "mcpServer",
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
  const rows: RowData[] = mcpServers.map((mcpServer) => ({
    mcpServer,
    spaces: [],
    onClick: () => {},
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
          console.log(spaceId);
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
          enabledMCPServers={mcpServers.map((mcpServer) => mcpServer.id)}
        />
      </div>

      <div className="flex justify-end"></div>
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
