import { ConnectMCPServerDialog } from "@app/components/actions/mcp/create/ConnectMCPServerDialog";
import { submitConnectMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitConnectMCPServerDialogForm";
import { canRefreshMCPAuthWithoutDialog } from "@app/components/actions/mcp/forms/utils";
import {
  OAUTH_USE_CASE_TO_DESCRIPTION,
  OAUTH_USE_CASE_TO_LABEL,
} from "@app/components/actions/mcp/MCPServerAuthConnection";
import { SensitivityLabelsConfig } from "@app/components/shared/labels/SensitivityLabelsConfig";
import type { SensitivityLabelsController } from "@app/components/shared/labels/types";
import { useSendApiErrorNotification } from "@app/hooks/useNotification";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

interface MCPServerSettingsProps {
  mcpServerView: MCPServerViewType;
  owner: LightWorkspaceType;
  sensitivityLabelsController?: SensitivityLabelsController;
}

function getSyncAuthWarningTooltip(
  oAuthUseCase: MCPOAuthUseCase | null
): MessageDescriptor {
  if (oAuthUseCase === "personal_actions") {
    return msg`The authentication used to set up and sync this tool is no longer valid and must be refreshed. Agents still use each member's personal authentication and are unaffected.`;
  }

  return msg`Shared authentication is no longer valid and must be refreshed. Until then, agents cannot use these tools.`;
}

export function MCPServerSettings({
  mcpServerView,
  owner,
  sensitivityLabelsController,
}: MCPServerSettingsProps) {
  const { t } = useLingui();
  const authorization = mcpServerView.server.authorization;
  const sendApiErrorNotification = useSendApiErrorNotification();
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
  const useCaseLabel = useCase ? t(OAUTH_USE_CASE_TO_LABEL[useCase]) : null;
  const useCaseDescription = useCase
    ? t(OAUTH_USE_CASE_TO_DESCRIPTION[useCase])
    : null;

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
      const providerName = OAUTH_PROVIDER_NAMES[authorization!.provider];
      sendApiErrorNotification({
        title: t`Failed to connect ${providerName}`,
        error: submitRes.error,
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
        <div className="heading-base">
          <Trans>Authentication</Trans>
        </div>
        <div className="flex space-x-2">
          <div className="flex flex-grow items-center gap-2">
            {mcpServerView.oAuthUseCase &&
              !isConnectionsLoading &&
              (connection ? (
                hasSyncError ? (
                  <>
                    <Chip color="warning" size="sm">
                      <Trans>Warning</Trans>
                    </Chip>
                    <Tooltip
                      label={t(
                        getSyncAuthWarningTooltip(mcpServerView.oAuthUseCase)
                      )}
                      className="max-w-sm"
                      tooltipTriggerAsChild
                      trigger={
                        <Hoverable variant="primary">
                          <Trans>More info</Trans>
                        </Hoverable>
                      }
                    />
                  </>
                ) : (
                  <Chip color="success" size="sm">
                    <Trans>Active</Trans>
                  </Chip>
                )
              ) : (
                <Chip color="warning" size="sm">
                  <Trans>Requires authentication</Trans>
                </Chip>
              ))}
          </div>
          {connection ? (
            <>
              <Button
                label={t`Refresh`}
                icon={RefreshCw02}
                variant="outline"
                onClick={() => {
                  void handleRefresh();
                }}
                disabled={isLoading}
                isLoading={isLoading}
              />
              <Button
                label={t`Deactivate`}
                icon={XClose}
                variant="outline"
                onClick={handleDeleteConnection}
              />
            </>
          ) : (
            <Button
              label={t`Activate`}
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
          <div className="heading-base">
            <Trans>Credentials</Trans>
          </div>
          <div className="w-full text-muted-foreground">
            {useCase && (
              <Trans>
                <span className="font-semibold">{useCaseLabel}</span>:{" "}
                {useCaseDescription}
              </Trans>
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
            <div className="heading-base">
              <Trans>Permissions</Trans>
            </div>
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
