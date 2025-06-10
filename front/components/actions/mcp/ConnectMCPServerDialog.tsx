import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import {
  getMcpServerDisplayName,
  getServerTypeAndIdFromSId,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useCreateMCPServerConnection,
  useDiscoverOAuthMetadata,
} from "@app/lib/swr/mcp_servers";
import type {
  MCPOAuthUseCase,
  OAuthCredentials,
  WorkspaceType,
} from "@app/types";
import { OAUTH_PROVIDER_NAMES, setupOAuthConnection } from "@app/types";

type ConnectMCPServerDialogProps = {
  owner: WorkspaceType;
  mcpServer: MCPServerType | null;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export function ConnectMCPServerDialog({
  owner,
  mcpServer,
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

  const serverType = useMemo(
    () =>
      mcpServer
        ? getServerTypeAndIdFromSId(mcpServer.sId).serverType
        : "internal",
    [mcpServer]
  );

  useEffect(() => {
    const discoverOAuth = async () => {
      if (isOpen && mcpServer) {
        if (serverType === "internal") {
          setAuthorization(mcpServer.authorization);
        } else if (
          isRemoteMCPServerType(mcpServer) &&
          mcpServer.url &&
          !remoteMCPServerOAuthDiscoveryDone
        ) {
          setIsLoading(true);
          const discoverOAuthMetadataRes = await discoverOAuthMetadata(
            mcpServer.url
          );

          if (
            discoverOAuthMetadataRes.isOk() &&
            discoverOAuthMetadataRes.value.oauthRequired
          ) {
            setAuthorization({
              provider: "mcp",
              // During setup, the use case is always "platform_actions".
              use_case: "platform_actions",
              supported_use_cases: ["platform_actions"], // TODO(mcp): Add personal_actions option.
            });
            setAuthCredentials({
              ...discoverOAuthMetadataRes.value.connectionMetadata,
            });
            setRemoteMCPServerOAuthDiscoveryDone(true);
          }
        }
        setIsLoading(false);
      } else {
        setAuthorization(null);
      }
    };

    void discoverOAuth();
  }, [
    mcpServer,
    isOpen,
    serverType,
    remoteMCPServerOAuthDiscoveryDone,
    discoverOAuthMetadata,
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
    if (!mcpServer) {
      throw new Error("MCP server is null while trying to connect");
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
    // Then associate connection
    await createMCPServerConnection({
      connectionId: cRes.value.connection_id,
      mcpServer: mcpServer,
      provider: authorization.provider,
    });

    setExternalIsLoading(false);
    setIsLoading(false);
    setIsOpen(false);
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
            Connect {mcpServer ? getMcpServerDisplayName(mcpServer) : ""}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {authorization && (
            <MCPServerOAuthConnexion
              remoteMCPServerUrl={
                mcpServer && isRemoteMCPServerType(mcpServer)
                  ? mcpServer.url
                  : undefined
              }
              useCase={useCase}
              setUseCase={setUseCase}
              authorization={authorization}
              authCredentials={authCredentials}
              setAuthCredentials={setAuthCredentials}
              setIsFormValid={setIsFormValid}
              documentationUrl={mcpServer?.documentationUrl}
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
            label: authorization ? "Save & Connect" : "",
            variant: "primary",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              if (isFormValid) {
                void handleSave();
              }
            },
            disabled: !isFormValid || (authorization && !useCase) || isLoading,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
