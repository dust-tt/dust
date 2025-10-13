import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerDisplayName,
  getMcpServerViewDisplayName,
  getServerTypeAndIdFromSId,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useCreateMCPServerConnection,
  useDiscoverOAuthMetadata,
  useUpdateMCPServerView,
} from "@app/lib/swr/mcp_servers";
import type {
  MCPOAuthUseCase,
  OAuthCredentials,
  WorkspaceType,
} from "@app/types";
import { OAUTH_PROVIDER_NAMES, setupOAuthConnection } from "@app/types";

type ConnectMCPServerDialogProps = {
  owner: WorkspaceType;
  mcpServerView: MCPServerViewType;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export function ConnectMCPServerDialog({
  owner,
  mcpServerView,
  setIsLoading: setExternalIsLoading,
  isOpen = false,
  setIsOpen,
}: ConnectMCPServerDialogProps) {
  const sendNotification = useSendNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [useCase, setUseCase] = useState<MCPOAuthUseCase | null>(null);
  const [authCredentials, setAuthCredentials] =
    useState<OAuthCredentials | null>(null);
  const [
    remoteMCPServerOAuthDiscoveryDone,
    setRemoteMCPServerOAuthDiscoveryDone,
  ] = useState(false);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );
  const [isFormValid, setIsFormValid] = useState(true);
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });
  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { updateServerView } = useUpdateMCPServerView(owner, mcpServerView);

  const serverType = useMemo(
    () => getServerTypeAndIdFromSId(mcpServerView.server.sId).serverType,
    [mcpServerView]
  );

  useEffect(() => {
    const discoverOAuth = async () => {
      if (isOpen && mcpServerView) {
        if (serverType === "internal") {
          setAuthorization(mcpServerView.server.authorization);
        } else if (
          isRemoteMCPServerType(mcpServerView.server) &&
          mcpServerView.server.url &&
          !remoteMCPServerOAuthDiscoveryDone
        ) {
          setIsLoading(true);
          const discoverOAuthMetadataRes = await discoverOAuthMetadata(
            mcpServerView.server.url,
            mcpServerView.server.customHeaders
              ? Object.entries(mcpServerView.server.customHeaders).map(
                  ([key, value]) => ({ key, value: String(value) })
                )
              : undefined
          );

          if (
            discoverOAuthMetadataRes.isOk() &&
            discoverOAuthMetadataRes.value.oauthRequired
          ) {
            setAuthorization({
              provider: "mcp",
              supported_use_cases: ["platform_actions", "personal_actions"],
            });
            setAuthCredentials({
              ...discoverOAuthMetadataRes.value.connectionMetadata,
            });
            setRemoteMCPServerOAuthDiscoveryDone(true);
          } else if (discoverOAuthMetadataRes.isErr()) {
            sendNotification({
              type: "error",
              title: "Failed to discover OAuth metadata for MCP server",
              description: `${discoverOAuthMetadataRes.error.message} (${mcpServerView.server.url})`,
            });
          }
        }
        setIsLoading(false);
      } else {
        setAuthorization(null);
      }
    };

    void discoverOAuth();
  }, [
    mcpServerView,
    isOpen,
    serverType,
    remoteMCPServerOAuthDiscoveryDone,
    discoverOAuthMetadata,
    sendNotification,
  ]);

  const resetState = useCallback(() => {
    setExternalIsLoading(false);
    setAuthCredentials(null);
    setIsLoading(false);
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setAuthorization(null);
    setUseCase(null);
  }, [setExternalIsLoading]);

  const handleSave = async () => {
    if (!mcpServerView) {
      throw new Error("MCP server view is null while trying to connect");
    }

    if (!authorization) {
      throw new Error("Authorization is null while trying to connect");
    }

    if (!useCase) {
      throw new Error("Use case is null while trying to connect");
    }

    // First setup connection
    setIsLoading(true);
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider: authorization.provider,
      // During setup, the use case is always "platform_actions".
      useCase: "platform_actions",
      extraConfig: {
        ...(authCredentials ?? {}),
        ...(authorization.scope ? { scope: authorization.scope } : {}),
      },
    });
    if (cRes.isErr()) {
      sendNotification({
        type: "error",
        title: `Failed to connect ${OAUTH_PROVIDER_NAMES[authorization.provider]}`,
        description: cRes.error.message,
      });
      setIsLoading(false);
      return;
    }

    setExternalIsLoading(true);
    // Then associate connection.
    await createMCPServerConnection({
      connectionId: cRes.value.connection_id,
      mcpServerId: mcpServerView.server.sId,
      mcpServerDisplayName: getMcpServerDisplayName(mcpServerView.server),
      provider: authorization.provider,
    });

    // And update the oAuthUseCase for the MCP server.
    await updateServerView({
      oAuthUseCase: useCase,
    });

    setExternalIsLoading(false);
    setIsLoading(false);
    setIsOpen(false);
    resetState();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        resetState();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            Connect {getMcpServerViewDisplayName(mcpServerView)}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {authorization && (
            <MCPServerOAuthConnexion
              useCase={useCase}
              setUseCase={setUseCase}
              authorization={authorization}
              authCredentials={authCredentials}
              setAuthCredentials={setAuthCredentials}
              setIsFormValid={setIsFormValid}
              documentationUrl={
                mcpServerView.server?.documentationUrl ?? undefined
              }
            />
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: resetState,
          }}
          rightButtonProps={{
            isLoading: isLoading,
            label: authorization ? "Setup connection" : "",
            variant: "primary",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              if (isFormValid) {
                void handleSave();
              }
            },
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            disabled: !isFormValid || (authorization && !useCase) || isLoading,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
