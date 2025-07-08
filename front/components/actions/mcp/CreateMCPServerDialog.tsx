import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SliderToggle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { MCPConnectionType } from "@app/lib/swr/mcp_servers";
import {
  useCreateInternalMCPServer,
  useCreateRemoteMCPServer,
  useDiscoverOAuthMetadata,
} from "@app/lib/swr/mcp_servers";
import type {
  MCPOAuthUseCase,
  OAuthCredentials,
  WorkspaceType,
} from "@app/types";
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
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
};

export function CreateMCPServerDialog({
  owner,
  internalMCPServer,
  setMCPServerToShow,
  setIsLoading: setExternalIsLoading,
  isOpen = false,
  setIsOpen,
  defaultServerConfig,
}: RemoteMCPServerDetailsProps) {
  const sendNotification = useSendNotification();
  const [
    remoteMCPServerOAuthDiscoveryDone,
    setRemoteMCPServerOAuthDiscoveryDone,
  ] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [remoteServerUrl, setRemoteServerUrl] = useState("");
  const [sharedSecret, setSharedSecret] = useState<string | undefined>(
    undefined
  );
  const [useCase, setUseCase] = useState<MCPOAuthUseCase | null>(null);
  const [authCredentials, setAuthCredentials] =
    useState<OAuthCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOAuthFormValid, setIsOAuthFormValid] = useState(true);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );
  const [requiresBearerToken, setRequiresBearerToken] = useState(false);

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  useEffect(() => {
    if (defaultServerConfig?.url && isOpen) {
      setRemoteServerUrl(defaultServerConfig.url);
    }
    if (defaultServerConfig && isOpen) {
      setRequiresBearerToken(defaultServerConfig.authMethod === "bearer");
    }
  }, [defaultServerConfig, isOpen]);

  useEffect(() => {
    if (internalMCPServer && isOpen) {
      setAuthorization(internalMCPServer.authorization);
    } else {
      setAuthorization(null);
    }
  }, [internalMCPServer, isOpen]);

  const resetState = useCallback(() => {
    setIsLoading(false);
    setExternalIsLoading(false);
    setError(null);
    setRemoteServerUrl("");
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setSharedSecret(undefined);
    setUseCase(null);
    setAuthCredentials(null);
    setRequiresBearerToken(false);
    setIsOAuthFormValid(true);
    setAuthorization(null);
  }, [setExternalIsLoading]);

  const handleSave = async (e: React.MouseEvent<HTMLButtonElement>) => {
    let oauthConnection: MCPConnectionType | undefined;
    setIsLoading(true);

    if (remoteServerUrl) {
      const urlValidation = validateUrl(remoteServerUrl);

      if (!urlValidation.valid) {
        e.preventDefault();
        setError(
          "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
        );
        setIsLoading(false);
        return;
      }

      if (!sharedSecret) {
        if (!remoteMCPServerOAuthDiscoveryDone) {
          const discoverOAuthMetadataRes =
            await discoverOAuthMetadata(remoteServerUrl);
          setRemoteMCPServerOAuthDiscoveryDone(true);

          if (discoverOAuthMetadataRes.isOk()) {
            if (discoverOAuthMetadataRes.value.oauthRequired) {
              setAuthorization({
                provider: "mcp",
                supported_use_cases: ["platform_actions", "personal_actions"],
              });

              setAuthCredentials(
                discoverOAuthMetadataRes.value.connectionMetadata
              );
              // Returning here as now the user must select the use case.
              setIsLoading(false);
              return;
            }
          } else if (discoverOAuthMetadataRes.isErr()) {
            sendNotification({
              type: "error",
              title: `Failed to discover OAuth metadata for ${remoteServerUrl}`,
              description: discoverOAuthMetadataRes.error.message,
            });
            setRemoteMCPServerOAuthDiscoveryDone(false);
            setIsLoading(false);
            return;
          }
        }
      }
    }

    if (authorization && !useCase) {
      // Should not happen as the button should be disabled if the use case is not selected.
      sendNotification({
        type: "error",
        title: "Missing use case",
        description: "Please select a use case",
      });
      setIsLoading(false);
      return;
    }

    // If the authorization is set, we need to setup the OAuth connection.

    if (authorization) {
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
        return;
      }
      oauthConnection = {
        useCase: useCase!,
        connectionId: cRes.value.connection_id,
      };
    }

    // Then, create the server, either internal or remote.
    setExternalIsLoading(true);
    let server: MCPServerType | undefined;
    if (internalMCPServer) {
      const createRes = await createInternalMCPServer({
        name: internalMCPServer.name,
        oauthConnection,
        includeGlobal: true,
      });

      if (createRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to create MCP server",
          description: createRes.error.message,
        });
        setExternalIsLoading(false);
        setIsLoading(false);
        return;
      }
      server = createRes.value.server;
    }

    if (remoteServerUrl) {
      const createRes = await createWithURL({
        url: remoteServerUrl,
        includeGlobal: true,
        sharedSecret: requiresBearerToken ? sharedSecret : undefined,
        oauthConnection,
      });

      if (createRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to create MCP server",
          description: createRes.error.message,
        });
        setExternalIsLoading(false);
        setIsLoading(false);
        return;
      }
      server = createRes.value.server;
    }

    sendNotification({
      title: "Success",
      type: "success",
      description: `${getMcpServerDisplayName(server!)} added successfully.`,
    });
    setMCPServerToShow(server!);
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
            {internalMCPServer
              ? `Add ${getMcpServerDisplayName(internalMCPServer)}`
              : defaultServerConfig
                ? `Add ${defaultServerConfig.name}`
                : "Add MCP Server"}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {!internalMCPServer && !authorization && (
            <>
              {defaultServerConfig && (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">
                    {defaultServerConfig.description}
                    {defaultServerConfig.documentationUrl && (
                      <>
                        {" "}
                        <a
                          href={defaultServerConfig.documentationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          See {defaultServerConfig.name} documentation.
                        </a>
                      </>
                    )}
                  </p>
                  {defaultServerConfig.connectionInstructions && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {defaultServerConfig.connectionInstructions}
                    </p>
                  )}
                </div>
              )}

              {!defaultServerConfig?.url && (
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
              )}
              {defaultServerConfig?.authMethod !== "oauth" && (
                <div className="space-y-2">
                  <Label htmlFor="requiresBearerToken">
                    {defaultServerConfig?.authMethod === "bearer"
                      ? `${defaultServerConfig.name} API Key`
                      : "Authentication"}
                  </Label>
                  <div className="flex items-center space-x-2">
                    {!defaultServerConfig && (
                      <div>
                        <SliderToggle
                          disabled={false}
                          selected={requiresBearerToken}
                          onClick={() =>
                            setRequiresBearerToken(!requiresBearerToken)
                          }
                        />
                      </div>
                    )}

                    <div className="flex-grow">
                      <Input
                        id="sharedSecret"
                        placeholder={
                          defaultServerConfig?.authMethod === "bearer"
                            ? `Paste your ${defaultServerConfig.name} API key here`
                            : requiresBearerToken
                              ? "Paste the Bearer Token here"
                              : ""
                        }
                        disabled={!requiresBearerToken}
                        value={sharedSecret}
                        onChange={(e) => setSharedSecret(e.target.value)}
                        isError={
                          defaultServerConfig?.authMethod === "bearer" &&
                          !sharedSecret
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {authorization && (
            <MCPServerOAuthConnexion
              authorization={authorization}
              authCredentials={authCredentials}
              useCase={useCase}
              setUseCase={setUseCase}
              setAuthCredentials={setAuthCredentials}
              setIsFormValid={setIsOAuthFormValid}
              documentationUrl={
                internalMCPServer?.documentationUrl ?? undefined
              }
            />
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            isLoading,
            label: authorization ? "Setup connection" : "Save",
            variant: "highlight",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              void handleSave(e);
            },
            disabled:
              !isOAuthFormValid ||
              (authorization && !useCase) ||
              (defaultServerConfig?.authMethod === "bearer" && !sharedSecret) ||
              isLoading,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
