import { Button, Cog6ToothIcon, Spinner } from "@dust-tt/sparkle";

import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { useMCPServerConnections } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

type MCPServerDetailsInfoProps = {
  mcpServer: MCPServerType;
  owner: LightWorkspaceType;
};

export function MCPServerDetailsInfo({
  mcpServer,
  owner,
}: MCPServerDetailsInfoProps) {
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
  });

  const connection = connections.find(
    (c) => c.internalMCPServerId === mcpServer.id
  );

  const { createAndSaveMCPServerConnection, deleteMCPServerConnection } =
    useMCPConnectionManagement({ owner });

  const authorization = mcpServer.authorization;
  if (!authorization) {
    return null;
  }

  return (
    mcpServer.authorization && (
      <div>
        <div className="text-text-foreground dark:text-text-foreground-night heading-lg pb-2"></div>

        {mcpServer?.authorization &&
          (isConnectionsLoading ? (
            <Spinner />
          ) : connection ? (
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
          ) : (
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
          ))}
      </div>
    )
  );
}
