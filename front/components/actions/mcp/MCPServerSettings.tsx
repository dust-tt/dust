import { Button, Chip, LoginIcon, XMarkIcon } from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import { ConnectMCPServerDialog } from "@app/components/actions/mcp/ConnectMCPServerDialog";
import {
  OAUTH_USE_CASE_TO_DESCRIPTION,
  OAUTH_USE_CASE_TO_LABEL,
} from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useDeleteMCPServerConnection,
  useMCPServerConnections,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, MCPOAuthUseCase } from "@app/types";

interface MCPServerSettingsProps {
  mcpServerView: MCPServerViewType;
  owner: LightWorkspaceType;
}

export function MCPServerSettings({
  mcpServerView,
  owner,
}: MCPServerSettingsProps) {
  const authorization = useMemo(
    () => mcpServerView.server.authorization,
    [mcpServerView.server.authorization]
  );

  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
    connectionType: "workspace",
    disabled: !authorization,
  });

  const connection = useMemo(
    () =>
      connections.find(
        (c) =>
          c.internalMCPServerId === mcpServerView.server.sId ||
          c.remoteMCPServerId === mcpServerView.server.sId
      ),
    [connections, mcpServerView.server.sId]
  );

  const { deleteMCPServerConnection } = useDeleteMCPServerConnection({
    owner,
  });

  const handleDeleteConnection = useCallback(() => {
    if (!connection || !mcpServerView) {
      return;
    }

    // eslint-disable-next-line react-hooks/immutability
    setSelectedUseCase(null);
    void deleteMCPServerConnection({
      connection,
      mcpServer: mcpServerView.server,
    });
  }, [deleteMCPServerConnection, connection, mcpServerView]);

  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUseCase, setSelectedUseCase] =
    useState<MCPOAuthUseCase | null>();

  const useCase = useMemo(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    () => (selectedUseCase || mcpServerView.oAuthUseCase) as MCPOAuthUseCase,
    [selectedUseCase, mcpServerView.oAuthUseCase]
  );

  return (
    <>
      <ConnectMCPServerDialog
        owner={owner}
        mcpServerView={mcpServerView}
        setIsLoading={setIsLoading}
        isOpen={isConnectDialogOpen}
        setIsOpen={setIsConnectDialogOpen}
      />
      <div className="space-y-2">
        <div className="heading-base">Authentication</div>
        <div className="flex space-x-2">
          <div className="flex-grow">
            {mcpServerView.oAuthUseCase &&
              !isConnectionsLoading &&
              (connection ? (
                <Chip color="success" size="sm">
                  Active
                </Chip>
              ) : (
                <Chip color="warning" size="sm">
                  Requires authentication
                </Chip>
              ))}
          </div>
          {connection ? (
            <Button
              label="Deactivate"
              icon={XMarkIcon}
              variant="outline"
              onClick={handleDeleteConnection}
            />
          ) : (
            <Button
              label="Activate"
              icon={LoginIcon}
              variant="primary"
              onClick={() => setIsConnectDialogOpen(true)}
              disabled={isLoading}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>

      {connection && (
        <div className="space-y-2">
          <div className="heading-base">Credentials</div>
          <div className="w-full text-muted-foreground dark:text-muted-foreground-night">
            {useCase === "platform_actions" && (
              <>
                <span className="font-semibold">
                  {OAUTH_USE_CASE_TO_LABEL["platform_actions"]}
                </span>
                : {OAUTH_USE_CASE_TO_DESCRIPTION["platform_actions"]}
              </>
            )}
            {useCase === "personal_actions" && (
              <>
                <span className="font-semibold">
                  {OAUTH_USE_CASE_TO_LABEL["personal_actions"]}
                </span>
                : {OAUTH_USE_CASE_TO_DESCRIPTION["personal_actions"]}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
