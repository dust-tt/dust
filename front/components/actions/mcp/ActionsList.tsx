import {
  Avatar,
  Button,
  classNames,
  Cog6ToothIcon,
  CommandLineIcon,
  DataTable,
  RocketIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React from "react";

import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import type {
  AllowedIconType,
  MCPServerMetadata,
} from "@app/lib/actions/mcp_actions";
import {
  useMCPServerConnections,
  useMcpServers,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types";

const MCP_SERVER_ICONS: Record<AllowedIconType, React.ElementType> = {
  command: CommandLineIcon,
  rocket: RocketIcon,
} as const;

type RowData = {
  mcpServer: MCPServerMetadata;
  onClick: () => void;
};

export const ActionsList = ({ owner }: { owner: LightWorkspaceType }) => {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
  });
  const { mcpServers, isMCPServersLoading } = useMcpServers({
    owner,
    space: (spaces ?? []).find((space) => space.kind === "system"),
    filter: "all",
  });

  const { createAndSaveMCPServerConnection, deleteMCPServerConnection } =
    useMCPConnectionManagement({ owner });

  const getTableColumns = (): ColumnDef<RowData, MCPServerMetadata>[] => {
    return [
      {
        id: "name",
        cell: (info: CellContext<RowData, MCPServerMetadata>) => (
          <DataTable.CellContent>
            <div
              className={classNames("flex flex-row items-center gap-2 py-3")}
            >
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
      },
      {
        id: "action",
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
      },
    ];
  };
  const rows: RowData[] = mcpServers.map((mcpServer) => ({
    mcpServer,
    onClick: () => {},
  }));
  const columns = getTableColumns();

  return isConnectionsLoading || isMCPServersLoading ? (
    <div className="mt-16 flex justify-center">
      <Spinner />
    </div>
  ) : (
    <DataTable data={rows} columns={columns} className="pb-4" />
  );
};
