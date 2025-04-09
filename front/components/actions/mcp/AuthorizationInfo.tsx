import {
  Button,
  Label,
  LockIcon,
  Page,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";

import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import type { MCPServerType } from "@app/lib/api/mcp";
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
          <span className="w-full font-semibold text-red-500">
            Authentication credentials is shared by all users of this workspace
            when they use this action.
          </span>
          <Button
            variant="warning"
            disabled={isConnectionsLoading}
            icon={LockIcon}
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
          <Label className="self-start">
            This action requires authentication with{" "}
            {OAUTH_PROVIDER_NAMES[authorization.provider]}.
          </Label>
          <span className="w-full font-semibold text-red-500">
            Authentication credentials will be shared by all users of this
            workspace when they use this action.
          </span>
          <Button
            variant="outline"
            disabled={isConnectionsLoading}
            icon={LockIcon}
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
      <Separator className="my-4" />
    </div>
  );
};
