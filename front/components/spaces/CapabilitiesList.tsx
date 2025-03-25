import type { SpaceType } from "@dust-tt/client";
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
import { useMCPServerConnections } from "@app/lib/swr/remote_mcp";
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
  space: SpaceType;
  capabilities: InternalMCPServerId[];
  owner: LightWorkspaceType;
}) => {
  const sendNotification = useSendNotification();
  const { connections, isConnectionsLoading, mutateConnections } =
    useMCPServerConnections({
      workspaceId: owner.sId,
    });

  const saveOAuthConnection = useCallback(
    async (connectionId: string | null, serverId: InternalMCPServerId) => {
      try {
        const response = await fetch(`/api/w/${owner.sId}/connections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connectionId,
            internalMCPServerId: serverId,
          }),
        });
        if (!response.ok) {
          sendNotification({
            type: "error",
            title: "Failed to connect provider",
            description:
              "Could not connect to your provider. Please try again.",
          });
        } else {
          sendNotification({
            type: "success",
            title: "Provider connected",
            description:
              "Your capability provider has been connected successfully.",
          });
        }
        void mutateConnections();
        return response;
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description:
            "Unexpected error trying to connect to your capability provider. Please try again. Error: " +
            error,
        });
      }
    },
    [owner.sId, sendNotification]
  );

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

      await saveOAuthConnection(cRes.value.connection_id, serverId);
    },
    [owner, sendNotification, saveOAuthConnection]
  );

  const handleDisconnect = useCallback(
    async (connection: string) => {
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/connections/${connection}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        if (!response.ok) {
          sendNotification({
            type: "error",
            title: "Failed to dicconnect provider",
            description:
              "Could not dicconnect to your provider. Please try again.",
          });
        } else {
          sendNotification({
            type: "success",
            title: "Provider disconnected",
            description:
              "Your capability provider has been disconnected successfully.",
          });
        }
        void mutateConnections();
        return response;
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to disconnect provider",
          description:
            "Unexpected error trying to disconnect to your capability provider. Please try again. Error: " +
            error,
        });
      }
    },
    [sendNotification]
  );

  const getTableColumns = (): ColumnDef<RowData, string>[] => {
    return [
      {
        id: "name",
        cell: (info: CellContext<RowData, string>) => (
          <DataTable.CellContent
            icon={internalMCPServers[info.row.original.id].icon}
          >
            {info.getValue()}
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
