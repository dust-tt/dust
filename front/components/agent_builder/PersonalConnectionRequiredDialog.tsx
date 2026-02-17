import {
  areCredentialOverridesValid,
  PersonalAuthCredentialOverrides,
} from "@app/components/oauth/PersonalAuthCredentialOverrides";
import { getIcon } from "@app/components/resources/resources_icons";
import { useSendNotification } from "@app/hooks/useNotification";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useCreatePersonalConnection,
  useMCPServerViewsWithPersonalConnections,
} from "@app/lib/swr/mcp_servers";
import { getOverridablePersonalAuthInputs } from "@app/types/oauth/lib";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
  Icon,
  LockIcon,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useEffect, useMemo, useState } from "react";

interface DialogState {
  isOpen: boolean;
  resolve?: (value: boolean) => void;
}

export function useAwaitableDialog({
  owner,
  mcpServerViewToCheckIds,
  mcpServerViews,
}: {
  owner: LightWorkspaceType;
  mcpServerViewToCheckIds: string[];
  mcpServerViews: MCPServerViewType[];
}) {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
  });

  const mcpServerViewsWithPersonalConnections =
    useMCPServerViewsWithPersonalConnections({
      owner,
      mcpServerViewToCheckIds,
      mcpServerViews,
    });

  const disconnectedCount = mcpServerViewsWithPersonalConnections.filter(
    ({ isAlreadyConnected }) => !isAlreadyConnected
  ).length;

  const showDialog = (): Promise<boolean> => {
    if (disconnectedCount === 0) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        resolve,
      });
    });
  };

  const handleConfirm = () => {
    dialogState.resolve?.(true);
    setDialogState({ isOpen: false });
  };

  const handleCancel = () => {
    dialogState.resolve?.(false);
    setDialogState({ isOpen: false });
  };

  return {
    showDialog,
    isOpen: dialogState.isOpen,
    mcpServerViewsWithPersonalConnections,
    onCancel: handleCancel,
    onClose: handleConfirm,
  };
}
export function PersonalConnectionRequiredDialog({
  owner,
  mcpServerViewsWithPersonalConnections,
  isOpen,
  onCancel,
  onClose,
}: {
  owner: LightWorkspaceType;
  mcpServerViewsWithPersonalConnections: {
    mcpServerView: MCPServerViewType;
    isAlreadyConnected: boolean;
  }[];
  isOpen: boolean;
  onCancel: () => void;
  onClose: (confirmed: boolean) => void;
}) {
  const { createPersonalConnection } = useCreatePersonalConnection(owner);
  const sendNotification = useSendNotification();
  const [isConnecting, setIsConnecting] = useState(false);
  const [overriddenCredentialsMap, setCredentialOverridesMap] = useState<
    Record<string, Record<string, string>>
  >({});

  useEffect(() => {
    if (!isOpen) {
      setCredentialOverridesMap({});
    }
  }, [isOpen]);

  const setOverrideValue = useCallback(
    (serverId: string, key: string, value: string) => {
      setCredentialOverridesMap((prev) => ({
        ...prev,
        [serverId]: {
          ...prev[serverId],
          [key]: value,
        },
      }));
    },
    []
  );

  const disconnectedCount = useMemo(() => {
    return mcpServerViewsWithPersonalConnections.filter(
      ({ isAlreadyConnected }) => !isAlreadyConnected
    ).length;
  }, [mcpServerViewsWithPersonalConnections]);

  return (
    <Dialog
      open={isOpen}
      modal={true}
      // If user dismisses the dialog some other way (e.g. clicking outside when not alert), treat it as cancel:
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent isAlertDialog={true} trapFocusScope={true}>
        <DialogHeader hideButton={true}>
          <DialogTitle>
            {disconnectedCount > 1 ? "Connections" : "Connection"} required for
            personal tools
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <ContentMessage
            icon={LockIcon}
            variant="highlight"
            title="About personal tools"
          >
            Personal tools uses credentials of the user running the agent. Other
            users will be asked to connect their own accounts when they run the
            agent.{" "}
            <Hoverable
              variant="highlight"
              href={`https://docs.dust.tt/docs/personal-vs-workspace-credentials-for-tools-mcp-servers`}
              target="_blank"
            >
              Learn more
            </Hoverable>
          </ContentMessage>

          <DialogDescription>
            {mcpServerViewsWithPersonalConnections.map(
              ({ mcpServerView, isAlreadyConnected }) => {
                const provider = mcpServerView.server.authorization?.provider;
                const serverOverridableInputs = provider
                  ? getOverridablePersonalAuthInputs({ provider })
                  : null;
                const serverOverrides =
                  overriddenCredentialsMap[mcpServerView.server.sId] ?? {};

                return (
                  <div key={mcpServerView.sId} className="py-2">
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon
                          visual={getIcon(mcpServerView.server.icon)}
                          size="md"
                        />
                        <strong>
                          {getMcpServerViewDisplayName(mcpServerView)}
                        </strong>
                      </div>
                      <div>
                        {isAlreadyConnected ? (
                          <Chip color="green" label="Connected" />
                        ) : (
                          <Button
                            icon={CloudArrowLeftRightIcon}
                            size="xs"
                            variant="outline"
                            label="Connect"
                            disabled={
                              isConnecting ||
                              !areCredentialOverridesValid(
                                serverOverridableInputs,
                                serverOverrides
                              )
                            }
                            onClick={async () => {
                              if (!mcpServerView.server.authorization) {
                                return;
                              }
                              setIsConnecting(true);
                              try {
                                const result = await createPersonalConnection({
                                  mcpServerId: mcpServerView.server.sId,
                                  mcpServerDisplayName:
                                    getMcpServerViewDisplayName(mcpServerView),
                                  authorization:
                                    mcpServerView.server.authorization,
                                  provider:
                                    mcpServerView.server.authorization.provider,
                                  useCase: "personal_actions",
                                  scope:
                                    mcpServerView.server.authorization.scope,
                                  overriddenCredentials:
                                    Object.keys(serverOverrides).length > 0
                                      ? serverOverrides
                                      : undefined,
                                });
                                if (!result.success && result.error) {
                                  sendNotification({
                                    type: "error",
                                    title: "Failed to connect provider",
                                    description: result.error,
                                  });
                                }
                              } finally {
                                setIsConnecting(false);
                              }
                            }}
                          />
                        )}
                      </div>
                    </div>
                    {!isAlreadyConnected && serverOverridableInputs && (
                      <div className="mt-2 pl-8 pr-2">
                        <PersonalAuthCredentialOverrides
                          inputs={serverOverridableInputs}
                          values={serverOverrides}
                          idPrefix={mcpServerView.server.sId}
                          onChange={(key, value) =>
                            setOverrideValue(
                              mcpServerView.server.sId,
                              key,
                              value
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              }
            )}
            <p className="mt-4">
              {disconnectedCount}{" "}
              {disconnectedCount > 1 ? "connections are" : "connection is"}{" "}
              required. If you proceed without connecting, the agent will
              request credentials when they use the tool.
            </p>
          </DialogDescription>
        </DialogContainer>

        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onCancel,
          }}
          rightButtonProps={{
            label: "Save",
            variant: disconnectedCount > 0 ? "warning" : "primary",
            onClick: () => onClose(true),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
