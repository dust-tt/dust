import { ConnectMCPServerDialog } from "@app/components/actions/mcp/create/ConnectMCPServerDialog";
import {
  OAUTH_USE_CASE_TO_DESCRIPTION,
  OAUTH_USE_CASE_TO_LABEL,
} from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useDeleteMCPServerConnection,
  useMCPServerConnections,
} from "@app/lib/swr/mcp_servers";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Chip, LoginIcon, XMarkIcon } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MCPServerSettingsProps {
  mcpServerView: MCPServerViewType;
  owner: LightWorkspaceType;
}

export function MCPServerSettings({
  mcpServerView,
  owner,
}: MCPServerSettingsProps) {
  const authorization = mcpServerView.server.authorization;

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

  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUseCase, setSelectedUseCase] =
    useState<MCPOAuthUseCase | null>(null);

  const useCase = selectedUseCase ?? mcpServerView.oAuthUseCase;

  const handleDeleteConnection = () => {
    if (!connection) {
      return;
    }

    setSelectedUseCase(null);
    void deleteMCPServerConnection({
      connection,
      mcpServer: mcpServerView.server,
    });
  };

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
