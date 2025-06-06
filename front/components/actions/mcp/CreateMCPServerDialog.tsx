import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useCheckOAuthConnection,
  useCreateInternalMCPServer,
  useCreateMCPServerConnection,
  useCreateRemoteMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { OAuthCredentials, WorkspaceType } from "@app/types";
import {
  OAUTH_PROVIDER_NAMES,
  setupOAuthConnection,
  validateUrl,
} from "@app/types";

type RemoteMCPServerDetailsProps = {
  owner: WorkspaceType;
  internalMCPServer?: MCPServerType;
  setMCPServerToShow: (server: MCPServerType) => void;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export function CreateMCPServerDialog({
  owner,
  internalMCPServer,
  setMCPServerToShow,
  setIsLoading,
  isOpen = false,
  setIsOpen,
}: RemoteMCPServerDetailsProps) {
  const sendNotification = useSendNotification();
  const [remoteServerUrl, setRemoteServerUrl] = useState("");
  const [sharedSecret, setSharedSecret] = useState<string | undefined>(
    undefined
  );
  const [authCredentials, setAuthCredentials] =
    useState<OAuthCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFormValid, setIsFormValid] = useState(true);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );

  const { checkOAuthConnection } = useCheckOAuthConnection(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  useEffect(() => {
    if (internalMCPServer) {
      setAuthorization(internalMCPServer.authorization);
    }
  }, [internalMCPServer]);

  const resetState = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setRemoteServerUrl("");
    setSharedSecret(undefined);
    setAuthCredentials(null);
    setAuthorization(null);
  }, [setIsLoading]);

  const handleSave = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (internalMCPServer) {
      setIsLoading(true);

      if (authorization) {
        // First setup connection
        const cRes = await setupOAuthConnection({
          dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
          owner,
          provider: authorization.provider,
          useCase: authorization.use_case,
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
          return;
        }

        // If ok, create server
        const createServerRes = await createInternalMCPServer(
          internalMCPServer.name,
          true
        );

        // Then associate connection
        if (createServerRes.success) {
          await createMCPServerConnection({
            connectionId: cRes.value.connection_id,
            mcpServer: createServerRes.server,
            provider: authorization.provider,
          });
        } else {
          sendNotification({
            type: "error",
            title: "Failed to create MCP server",
          });
        }
      } else {
        await createInternalMCPServer(internalMCPServer.name, true);
      }
      setIsLoading(false);
      return;
    } else {
      const urlValidation = validateUrl(remoteServerUrl);

      if (!urlValidation.valid) {
        e.preventDefault();
        setError(
          "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
        );
        return;
      }

      try {
        setIsLoading(true);

        let connectionId: string | undefined;
        const checkOAuthConnectionRes =
          await checkOAuthConnection(remoteServerUrl);
        if (
          checkOAuthConnectionRes.isOk() &&
          checkOAuthConnectionRes.value.oauthRequired
        ) {
          sendNotification({
            title: "Authorization required",
            type: "info",
            description:
              "You must authorize the MCP server to access your data.",
          });
          const cRes = await setupOAuthConnection({
            dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
            owner,
            provider: "mcp",
            useCase: "platform_actions",
            extraConfig: checkOAuthConnectionRes.value.connectionMetadata,
          });
          if (cRes.isOk()) {
            connectionId = cRes.value.connection_id;
          }
        }

        const createRes = await createWithURL({
          url: remoteServerUrl,
          includeGlobal: true,
          sharedSecret,
          connectionId,
        });

        if (createRes.isOk()) {
          sendNotification({
            title: "Success",
            type: "success",
            description: `${getMcpServerDisplayName(createRes.value.server)} added successfully.`,
          });
          setMCPServerToShow(createRes.value.server);
        } else {
          sendNotification({
            title: "Error creating MCP server",
            type: "error",
            description: createRes.error.message,
          });
        }
      } catch (error) {
        sendNotification({
          title: "Error creating MCP server",
          type: "error",
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
      } finally {
        resetState();
      }
    }
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
            {internalMCPServer
              ? `Add ${getMcpServerDisplayName(internalMCPServer)}`
              : "Add MCP Server"}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {!internalMCPServer && (
            <>
              <div className="space-y-2">
                <Label htmlFor="url">URL</Label>
                <div className="flex space-x-2">
                  <div className="flex-grow">
                    <Input
                      id="url"
                      placeholder="https://example.com/api/mcp"
                      value={remoteServerUrl}
                      onChange={(e) => setRemoteServerUrl(e.target.value)}
                      isError={!!error}
                      message={error}
                      autoFocus
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sharedSecret">
                  Bearer Token (if the server requires authentication)
                </Label>
                <div className="flex space-x-2">
                  <div className="flex-grow">
                    <Input
                      id="sharedSecret"
                      placeholder="Paste the Bearer Token here (optional)"
                      value={sharedSecret}
                      onChange={(e) => setSharedSecret(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          <MCPServerOAuthConnexion
            authorization={authorization}
            authCredentials={authCredentials}
            setAuthCredentials={setAuthCredentials}
            setIsFormValid={setIsFormValid}
            documentationUrl={internalMCPServer?.documentationUrl}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: resetState,
          }}
          rightButtonProps={{
            label: authorization ? "Save and connect" : "Save",
            variant: "primary",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              if (isFormValid) {
                void handleSave(e);
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
