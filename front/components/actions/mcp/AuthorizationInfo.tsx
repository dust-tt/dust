import { Button, Label, Page } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import { Cog6ToothIcon } from "@heroicons/react/20/solid";

import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { useMCPServerConnections } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { OAUTH_PROVIDER_NAMES } from "@app/types";

type AuthorizationInfoProps = {
  mcpServer: MCPServerType;
  owner: LightWorkspaceType;
};

export const AuthorizationInfo = ({
  mcpServer,
  owner,
}: AuthorizationInfoProps) => {
  const authorization = mcpServer.authorization;

  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
    disabled: !authorization,
  });

  const connection = connections.find(
    (c) => c.internalMCPServerId === mcpServer.id
  );

  const { createAndSaveMCPServerConnection, deleteMCPServerConnection } =
    useMCPConnectionManagement({ owner });

  if (!authorization) {
    return null;
  }
  return (
    <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
      <Page.SectionHeader title="Authorization" />

      {isConnectionsLoading ? (
        <Spinner />
      ) : connection ? (
        <div className="flex flex-col items-center gap-2">
          <Label className="self-start">
            This action has been successfully authenticated with{" "}
            {OAUTH_PROVIDER_NAMES[authorization.provider]}.
          </Label>
          <Button
            variant="warning"
            disabled={isConnectionsLoading}
            icon={Cog6ToothIcon}
            label={"Disconnect"}
            size="sm"
            onClick={() => {
              void deleteMCPServerConnection({
                connectionId: connection.sId,
              });
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="w-full">
            This action requires authentication with{" "}
            {OAUTH_PROVIDER_NAMES[authorization.provider]}.
          </span>
          <Button
            variant="outline"
            disabled={isConnectionsLoading}
            icon={Cog6ToothIcon}
            label={"Connect"}
            size="sm"
            onClick={() => {
              void createAndSaveMCPServerConnection({
                authorizationInfo: authorization,
                mcpServerId: mcpServer.id,
              });
            }}
          />
        </div>
      )}
    </div>
  );
};
