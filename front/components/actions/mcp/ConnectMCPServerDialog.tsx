import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import {
  getMcpServerDisplayName,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useCreateMCPServerConnection,
  useDiscoverOAuthMetadata,
} from "@app/lib/swr/mcp_servers";
import type { OAuthCredentials, WorkspaceType } from "@app/types";
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
  setIsLoading,
  isOpen = false,
  setIsOpen,
}: ConnectMCPServerDialogProps) {
  const sendNotification = useSendNotification();
  const [authCredentials, setAuthCredentials] =
    useState<OAuthCredentials | null>(null);
  const [isFormValid, setIsFormValid] = useState(true);

  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);

  const resetState = useCallback(() => {
    setIsLoading(false);
    setAuthCredentials(null);
  }, [setIsLoading]);

  const handleSave = async () => {
    if (!mcpServer?.authorization) {
      throw new Error(
        "MCP server has no authorization while trying to connect"
      );
    }

    setIsLoading(true);

    let extraConfig: OAuthCredentials = authCredentials ?? {};

    if (isRemoteMCPServerType(mcpServer) && mcpServer.url) {
      const discoverOAuthMetadataRes = await discoverOAuthMetadata(
        mcpServer.url
      );
      if (
        discoverOAuthMetadataRes.isOk() &&
        discoverOAuthMetadataRes.value.oauthRequired
      ) {
        extraConfig = {
          ...extraConfig,
          ...discoverOAuthMetadataRes.value.connectionMetadata,
        };
      }
    }

    // First setup connection
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider: mcpServer.authorization.provider,
      useCase: mcpServer.authorization.use_case,
      extraConfig: {
        ...extraConfig,
        ...(mcpServer.authorization.scope
          ? { scope: mcpServer.authorization.scope }
          : {}),
      },
    });
    if (cRes.isErr()) {
      sendNotification({
        type: "error",
        title: `Failed to connect ${OAUTH_PROVIDER_NAMES[mcpServer.authorization.provider]}`,
        description: cRes.error.message,
      });
      return;
    }

    // Then associate connection
    await createMCPServerConnection({
      connectionId: cRes.value.connection_id,
      mcpServer: mcpServer,
      provider: mcpServer.authorization.provider,
    });

    setIsLoading(false);
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
          <MCPServerOAuthConnexion
            authorization={mcpServer?.authorization ?? null}
            authCredentials={authCredentials}
            setAuthCredentials={setAuthCredentials}
            setIsFormValid={setIsFormValid}
            documentationUrl={mcpServer?.documentationUrl}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: resetState,
          }}
          rightButtonProps={{
            label: mcpServer?.authorization ? "Save and connect" : "Save",
            variant: "primary",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              if (isFormValid) {
                void handleSave();
                setIsOpen(false);
              }
            },
            disabled: !isFormValid,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
