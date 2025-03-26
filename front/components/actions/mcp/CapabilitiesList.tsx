import {
  Button,
  Cog6ToothIcon,
  DataTable,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useCallback } from "react";

import type {
  AuthorizationInfo,
  InternalMCPServerId,
} from "@app/lib/actions/mcp_internal_actions";
import { internalMCPServers } from "@app/lib/actions/mcp_internal_actions";
import {
  useCreateMCPServerConnection,
  useDeleteMCPServerConnection,
  useMCPServerConnections,
} from "@app/lib/swr/remote_mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { setupOAuthConnection } from "@app/types";
import { OAUTH_PROVIDER_NAMES } from "@app/types/oauth/lib";

type RowData = {
  id: InternalMCPServerId;
  onClick: () => void;
};

export const CapabilitiesList = ({
  capabilities,
  owner,
}: {
  capabilities: InternalMCPServerId[];
  owner: LightWorkspaceType;
}) => {
  const sendNotification = useSendNotification();
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
  });

  const { createMCPServerConnection } = useCreateMCPServerConnection({ owner });
  const { deleteMCPServerConnection } = useDeleteMCPServerConnection({ owner });
  const handleConnect = useCallback(
    async (
      authorizationInfo: AuthorizationInfo,
      serverId: InternalMCPServerId
    ) => {
      const cRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: authorizationInfo.provider,
        useCase: authorizationInfo.use_case,
        extraConfig: {},
      });

      if (cRes.isErr()) {
        sendNotification({
          type: "error",
          title: `Failed to connect ${OAUTH_PROVIDER_NAMES[authorizationInfo.provider]}`,
          description: cRes.error.message,
        });
        return;
      }
      const res = await createMCPServerConnection({
        connectionId: cRes.value.connection_id,
        internalMCPServerId: serverId,
      });
      if (res.success) {
        sendNotification({
          type: "success",
          title: "Provider connected",
          description:
            "Your capability provider has been connected successfully.",
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description: "Could not connect to your provider. Please try again.",
        });
      }
    },
    [owner, sendNotification, createMCPServerConnection]
  );

  const handleDisconnect = useCallback(
    async (connectionId: string) => {
      const res = await deleteMCPServerConnection({
        connectionId,
      });
      if (res.success) {
        sendNotification({
          type: "success",
          title: "Provider disconnected",
          description:
            "Your capability provider has been disconnected successfully.",
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to disconnect provider",
          description:
            "Could not disconnect to your provider. Please try again.",
        });
      }
    },
    [deleteMCPServerConnection, sendNotification]
  );

  const getTableColumns = (): ColumnDef<RowData, string>[] => {
    return [
      {
        id: "name",
        cell: (info: CellContext<RowData, string>) => (
          <DataTable.CellContent>
            {info.getValue()}
            <div className="text-sm text-gray-500">
              {internalMCPServers[info.row.original.id].serverInfo?.description}
            </div>
          </DataTable.CellContent>
        ),
        accessorFn: (row: RowData): string =>
          internalMCPServers[row.id].serverInfo.name,
      },
      {
        id: "action",
        cell: (info: CellContext<RowData, string>) => {
          const { id } = info.row.original;
          const serverInfo = internalMCPServers[id].serverInfo;
          const connection = connections.find(
            (c) => c.internalMCPServerId === id
          );

          const { authorization } = serverInfo;
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
                  void handleDisconnect(connection.sId);
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
                  void handleConnect(authorization, id);
                }}
              />
            </DataTable.CellContent>
          );
        },
        accessorFn: (row: RowData): string => row.id,
        meta: {
          className: "w-36",
        },
      },
    ];
  };
  const rows: RowData[] = capabilities.map((id) => ({
    id,
    onClick: () => {},
  }));
  const columns = getTableColumns();

  return <DataTable data={rows} columns={columns} className="pb-4" />;
};
