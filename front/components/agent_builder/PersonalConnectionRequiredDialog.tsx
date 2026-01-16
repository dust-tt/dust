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
  Input,
  LockIcon,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useState } from "react";

import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useCreatePersonalConnection,
  useMCPServerViewsWithPersonalConnections,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

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
  const [isConnecting, setIsConnecting] = useState(false);
  const [additionalInputsMap, setAdditionalInputsMap] = useState<
    Record<string, Record<string, string>>
  >({});

  useEffect(() => {
    if (!isOpen) {
      setAdditionalInputsMap({});
    }
  }, [isOpen]);

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
                const personalAuthInputs =
                  mcpServerView.server.authorization?.personalAuthInputs ?? [];
                const personalAuthDefaults =
                  mcpServerView.server.authorization?.personalAuthDefaults ??
                  {};
                const serverInputs =
                  additionalInputsMap[mcpServerView.sId] ?? {};
                const canConnect = personalAuthInputs.every(
                  ({ extraConfigKey, required }) =>
                    !required ||
                    !!serverInputs[extraConfigKey]?.trim() ||
                    !!personalAuthDefaults[extraConfigKey]?.trim()
                );

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
                            disabled={isConnecting || !canConnect}
                            onClick={async () => {
                              if (!mcpServerView.server.authorization) {
                                return;
                              }
                              setIsConnecting(true);
                              try {
                                await createPersonalConnection({
                                  mcpServerId: mcpServerView.server.sId,
                                  mcpServerDisplayName:
                                    getMcpServerViewDisplayName(mcpServerView),
                                  provider:
                                    mcpServerView.server.authorization.provider,
                                  useCase: "personal_actions",
                                  scope:
                                    mcpServerView.server.authorization.scope,
                                  additionalInputs: serverInputs,
                                });
                              } finally {
                                setIsConnecting(false);
                              }
                            }}
                          />
                        )}
                      </div>
                    </div>
                    {!isAlreadyConnected &&
                      personalAuthInputs.map((input) => (
                        <div
                          key={input.extraConfigKey}
                          className="mt-2 pl-8 pr-2"
                        >
                          <Input
                            name={input.extraConfigKey}
                            placeholder={
                              input.placeholder ??
                              (input.required
                                ? input.label
                                : `${input.label} (optional)`)
                            }
                            value={serverInputs[input.extraConfigKey] ?? ""}
                            onChange={(e) => {
                              setAdditionalInputsMap((prev) => ({
                                ...prev,
                                [mcpServerView.sId]: {
                                  ...prev[mcpServerView.sId],
                                  [input.extraConfigKey]: e.target.value,
                                },
                              }));
                            }}
                            message={
                              personalAuthDefaults[input.extraConfigKey]
                                ? `Default: ${personalAuthDefaults[input.extraConfigKey]}`
                                : undefined
                            }
                          />
                        </div>
                      ))}
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
