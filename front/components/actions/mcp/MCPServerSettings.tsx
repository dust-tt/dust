import { ConnectMCPServerDialog } from "@app/components/actions/mcp/create/ConnectMCPServerDialog";
import { submitConnectMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitConnectMCPServerDialogForm";
import { canRefreshMCPAuthWithoutDialog } from "@app/components/actions/mcp/forms/utils";
import {
  OAUTH_USE_CASE_TO_DESCRIPTION,
  OAUTH_USE_CASE_TO_LABEL,
} from "@app/components/actions/mcp/MCPServerAuthConnection";
import { SensitivityLabelsConfig } from "@app/components/shared/labels/SensitivityLabelsConfig";
import type { SensitivityLabelsController } from "@app/components/shared/labels/types";
import { useSendNotification } from "@app/hooks/useNotification";
import { isRemoteMCPServerType } from "@app/lib/actions/mcp_helper";
import { getSensitivityLabelProviderForServerId } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useCellContext } from "@app/lib/auth/CellContext";
import {
  useCreateMCPServerConnection,
  useDeleteMCPServerConnection,
  useMCPServerConnections,
  useUpdateMCPServerView,
} from "@app/lib/swr/mcp_servers";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import { OAUTH_PROVIDER_NAMES } from "@app/types/oauth/lib";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  Hoverable,
  LogIn01,
  RefreshCw02,
  Tooltip,
  XClose,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MCPServerSettingsProps {
  mcpServerView: MCPServerViewType;
  owner: LightWorkspaceType;
  sensitivityLabelsController?: SensitivityLabelsController;
}

function getSyncAuthWarningTooltip(
  oAuthUseCase: MCPOAuthUseCase | null
): string {
  if (oAuthUseCase === "personal_actions") {
    return "The authentication used to set up and sync this tool is no longer valid and must be refreshed. Agents still use each member's personal authentication and are unaffected.";
  }

  return "Shared authentication is no longer valid and must be refreshed. Until then, agents cannot use these tools.";
}

export function MCPServerSettings({
  mcpServerView,
  owner,
  sensitivityLabelsController,
}: MCPServerSettingsProps) {
  const authorization = mcpServerView.server.authorization;
  const sendNotification = useSendNotification();
  const cellContext = useCellContext();

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
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });
  const { updateServerView } = useUpdateMCPServerView(owner, mcpServerView);

  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [lockUseCase, setLockUseCase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUseCase, setSelectedUseCase] =
    useState<MCPOAuthUseCase | null>(null);

  const { featureFlags } = useFeatureFlags();
  const hasSensitivityLabels = featureFlags.includes("sensitivity_labels");
  const useCase = selectedUseCase ?? mcpServerView.oAuthUseCase;
  const sensitivityLabelProvider = getSensitivityLabelProviderForServerId(
    mcpServerView.server.sId
  );

  const hasSyncError =
    isRemoteMCPServerType(mcpServerView.server) &&
    !!mcpServerView.server.lastError;

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

  const openConnectDialog = ({ lock }: { lock: boolean }) => {
    setLockUseCase(lock);
    setIsConnectDialogOpen(true);
  };

  const handleRefresh = async () => {
    const refreshUseCase = mcpServerView.oAuthUseCase;
    if (
      !canRefreshMCPAuthWithoutDialog({
        authorization,
        useCase: refreshUseCase,
      })
    ) {
      // Needs credential fields or a static form — keep the dialog, but lock the
      // existing use case so Refresh does not re-ask for connection type.
      openConnectDialog({ lock: true });
      return;
    }

    // Relaunch OAuth from the click handler so window.open stays on the user gesture.
    setIsLoading(true);
    const submitRes = await submitConnectMCPServerDialogForm({
      owner,
      mcpServerView,
      authorization: authorization!,
      values: {
        useCase: refreshUseCase!,
        authCredentials: null,
      },
      createMCPServerConnection,
      updateServerView,
      onBeforeAssociateConnection: () => {},
      cellInfo: cellContext.cellInfo,
    });
    setIsLoading(false);

    if (submitRes.isErr()) {
      sendNotification({
        type: "error",
        title: `Failed to connect ${OAUTH_PROVIDER_NAMES[authorization!.provider]}`,
        description: submitRes.error.message,
      });
    }
  };

  return (
    <>
      <ConnectMCPServerDialog
        owner={owner}
        mcpServerView={mcpServerView}
        setIsLoading={setIsLoading}
        isOpen={isConnectDialogOpen}
        setIsOpen={setIsConnectDialogOpen}
        initialUseCase={mcpServerView.oAuthUseCase}
        lockUseCase={lockUseCase}
      />
      <div className="space-y-2">
        <div className="heading-base">Authentication</div>
        <div className="flex space-x-2">
          <div className="flex flex-grow items-center gap-2">
            {mcpServerView.oAuthUseCase &&
              !isConnectionsLoading &&
              (connection ? (
                hasSyncError ? (
                  <>
                    <Chip color="warning" size="sm">
                      Warning
                    </Chip>
                    <Tooltip
                      label={getSyncAuthWarningTooltip(
                        mcpServerView.oAuthUseCase
                      )}
                      className="max-w-sm"
                      tooltipTriggerAsChild
                      trigger={
                        <Hoverable variant="primary">More info</Hoverable>
                      }
                    />
                  </>
                ) : (
                  <Chip color="success" size="sm">
                    Active
                  </Chip>
                )
              ) : (
                <Chip color="warning" size="sm">
                  Requires authentication
                </Chip>
              ))}
          </div>
          {connection ? (
            <>
              <Button
                label="Refresh"
                icon={RefreshCw02}
                variant="outline"
                onClick={() => {
                  void handleRefresh();
                }}
                disabled={isLoading}
                isLoading={isLoading}
              />
              <Button
                label="Deactivate"
                icon={XClose}
                variant="outline"
                onClick={handleDeleteConnection}
              />
            </>
          ) : (
            <Button
              label="Activate"
              icon={LogIn01}
              variant="primary"
              onClick={() => openConnectDialog({ lock: false })}
              disabled={isLoading}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>

      {connection && (
        <div className="space-y-2">
          <div className="heading-base">Credentials</div>
          <div className="w-full text-muted-foreground">
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

      {connection &&
        hasSensitivityLabels &&
        sensitivityLabelProvider !== null &&
        sensitivityLabelsController && (
          <SensitivityLabelsConfig
            owner={owner}
            controller={sensitivityLabelsController}
          />
        )}

      {authorization?.availableScopes &&
        authorization.availableScopes.length > 0 && (
          <div className="space-y-2">
            <div className="heading-base">Permissions</div>
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                const activeScopes = new Set(
                  authorization.scope?.split(" ") ?? []
                );
                return authorization.availableScopes
                  .filter(
                    (s) =>
                      activeScopes.has(s.value) ||
                      (s.impliedBy !== undefined &&
                        activeScopes.has(s.impliedBy))
                  )
                  .map((s) => (
                    <Chip
                      key={s.value}
                      color="primary"
                      size="sm"
                      label={s.label}
                    />
                  ));
              })()}
            </div>
          </div>
        )}
    </>
  );
}
