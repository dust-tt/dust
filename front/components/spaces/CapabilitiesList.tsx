import type { SpaceType } from "@dust-tt/client";
import {
  Button,
  Cog6ToothIcon,
  DataTable,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { ComponentType } from "react";
import { useCallback } from "react";

import type {
  AuthorizationInfo,
  ServerInfo,
} from "@app/lib/actions/mcp_internal_actions";
import { internalMCPServers } from "@app/lib/actions/mcp_internal_actions";
import type { LightWorkspaceType } from "@app/types";
import { setupOAuthConnection } from "@app/types";

type RowData = {
  icon: ComponentType;
  serverInfo: ServerInfo;
  onClick?: () => void;
};

export const CapabilitiesList = ({
  serverInfos,
  owner,
}: {
  space: SpaceType;
  serverInfos: ServerInfo[];
  owner: LightWorkspaceType;
}) => {
  const sendNotification = useSendNotification();

  const saveOAuthConnection = useCallback(
    async (
      connectionId: string | null,
      provider: string,
      useConnectorConnection?: boolean
    ) => {
      try {
        const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connectionId,
            provider,
            useConnectorConnection,
          }),
        });
        if (!response.ok) {
          sendNotification({
            type: "error",
            title: "Failed to connect provider",
            description:
              "Could not connect to your transcripts provider. Please try again.",
          });
        } else {
          sendNotification({
            type: "success",
            title: "Provider connected",
            description:
              "Your transcripts provider has been connected successfully.",
          });
        }
        return response;
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description:
            "Unexpected error trying to connect to your transcripts provider. Please try again. Error: " +
            error,
        });
      }
    },
    [owner.sId, sendNotification]
  );

  const handleConnect = useCallback(
    async (authorizationInfo: AuthorizationInfo) => {
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
          title: "Failed to connect Google Drive",
          description: cRes.error.message,
        });
        return;
      }

      await saveOAuthConnection(cRes.value.connection_id, "google_drive");
    },
    [owner, sendNotification, saveOAuthConnection]
  );

  const getTableColumns = (): ColumnDef<RowData, string>[] => {
    return [
      {
        id: "name",
        cell: (info: CellContext<RowData, string>) => (
          <DataTable.CellContent icon={info.row.original.icon}>
            {info.getValue()}
          </DataTable.CellContent>
        ),
        accessorFn: (row: RowData) => row.serverInfo.name,
      },
      {
        id: "action",
        cell: (info: CellContext<RowData, string>) => {
          const authorizationInfo = info.row.original.serverInfo.authorization;
          if (!authorizationInfo) {
            return null;
          }

          return (
            <DataTable.CellContent>
              <Button
                variant="outline"
                icon={Cog6ToothIcon}
                label={"Connect"}
                size="xs"
                onClick={() => {
                  void handleConnect(authorizationInfo);
                }}
              />
            </DataTable.CellContent>
          );
        },
        meta: {
          className: "w-12",
        },
      },
    ];
  };
  const rows = serverInfos.map((serverInfo) => ({
    icon: internalMCPServers["helloworld"].icon,
    serverInfo,
    handleConnect,
    onClick: () => {
      console.log("clicked");
    },
  }));
  const columns = getTableColumns();

  return <DataTable data={rows} columns={columns} className="pb-4" />;
};
