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
  setMCPServer: (server: MCPServerType) => void;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export function CreateMCPServerDialog({
  owner,
  internalMCPServer,
  setMCPServer,
  setIsLoading,
  isOpen = false,
  setIsOpen,
}: RemoteMCPServerDetailsProps) {
  const sendNotification = useSendNotification();
  const [url, setUrl] = useState("");
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

  const { createWithUrlSync } = useCreateRemoteMCPServer(owner);
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  useEffect(() => {
    if (internalMCPServer) {
      setAuthorization(internalMCPServer.authorization);
    } else {
      setAuthorization(null);
    }
  }, [internalMCPServer]);

  const resetState = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setUrl("");
    setSharedSecret(undefined);
    setAuthCredentials(null);
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
          extraConfig: authCredentials ?? {},
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
            mcpServerId: createServerRes.server.sId,
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
      // TODO: Handle Authorization for remote servers

      const urlValidation = validateUrl(url);

      if (!urlValidation.valid) {
        e.preventDefault();
        setError(
          "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
        );
        return;
      }

      try {
        setIsLoading(true);
        const result = await createWithUrlSync(url, true, sharedSecret);

        if (result.success) {
          sendNotification({
            title: "Success",
            type: "success",
            description: "MCP server synchronized successfully.",
          });
          setMCPServer(result.server);
        } else {
          throw new Error("Failed to synchronize MCP server");
        }
      } catch (error) {
        sendNotification({
          title: "Error synchronizing MCP server",
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
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
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
