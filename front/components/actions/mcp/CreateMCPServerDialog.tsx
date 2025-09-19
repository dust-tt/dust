import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  InformationCircleIcon,
  Input,
  Label,
  Tooltip,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import { useSendNotification } from "@app/hooks/useNotification";
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

const DEFAULT_AUTH_METHOD = "oauth-dynamic";

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

  const [authMethod, setAuthMethod] = useState<
    "oauth-dynamic" | "oauth-static" | "bearer"
  >(DEFAULT_AUTH_METHOD);

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  useEffect(() => {
    if (defaultServerConfig?.url && isOpen) {
      setRemoteServerUrl(defaultServerConfig.url);
    }
    if (defaultServerConfig && isOpen) {
      setAuthMethod(defaultServerConfig.authMethod ?? DEFAULT_AUTH_METHOD);
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
    setAuthMethod(DEFAULT_AUTH_METHOD);
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

      if (authMethod === "oauth-dynamic") {
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
              title: "Failed to discover OAuth metadata for MCP server",
              description: `${discoverOAuthMetadataRes.error.message} (${remoteServerUrl})`,
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
        sharedSecret: authMethod === "bearer" ? sharedSecret : undefined,
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
          {!internalMCPServer &&
            (!authorization || authorization.provider === "mcp_static") && (
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
                {(!defaultServerConfig ||
                  defaultServerConfig?.authMethod === "bearer") && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Label>Authentication</Label>
                        <Tooltip
                          trigger={
                            <Icon
                              visual={InformationCircleIcon}
                              size="xs"
                              className="text-gray-400"
                            />
                          }
                          label="Choose how to authenticate to the MCP server: Automatic discovery, Bearer token, or Static OAuth credentials."
                        />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            isSelect
                            label={
                              authMethod === "oauth-dynamic"
                                ? "Automatic"
                                : authMethod === "bearer"
                                  ? defaultServerConfig?.authMethod === "bearer"
                                    ? `${defaultServerConfig.name} API Key`
                                    : "Bearer token"
                                  : "Static OAuth"
                            }
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuRadioGroup>
                            {!defaultServerConfig && (
                              <DropdownMenuRadioItem
                                value="oauth-dynamic"
                                label="Automatic"
                                onClick={() => {
                                  setAuthMethod("oauth-dynamic");
                                  setAuthorization(null);
                                  setIsOAuthFormValid(true);
                                }}
                              />
                            )}
                            {(!defaultServerConfig ||
                              defaultServerConfig?.authMethod === "bearer") && (
                              <DropdownMenuRadioItem
                                value="bearer"
                                label={
                                  defaultServerConfig?.authMethod === "bearer"
                                    ? `${defaultServerConfig.name} API Key`
                                    : "Bearer token"
                                }
                                onClick={() => {
                                  setAuthMethod("bearer");
                                  setAuthorization(null);
                                  setIsOAuthFormValid(true);
                                }}
                              />
                            )}
                            {!defaultServerConfig && (
                              <DropdownMenuRadioItem
                                value="oauth-static"
                                label="Static OAuth"
                                onClick={() => {
                                  setAuthMethod("oauth-static");
                                  setAuthorization({
                                    provider: "mcp_static",
                                    supported_use_cases: [
                                      "platform_actions",
                                      "personal_actions",
                                    ],
                                  });
                                  setIsOAuthFormValid(false);
                                }}
                              />
                            )}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {(authMethod === "oauth-dynamic" ||
                      defaultServerConfig?.authMethod === "oauth-dynamic") && (
                    <div className="text-xs text-muted-foreground">
                        Dust will automatically discover if OAuth authentication is required. If OAuth is not needed, the server will be accessed without authentication. Otherwise, Dust will try to use dynamic client registration to get the OAuth credentials.
                      </div>
                    )}
                    {(authMethod === "bearer" ||
                      defaultServerConfig?.authMethod === "bearer") && (
                      <div className="flex-grow">
                        <Input
                          id="sharedSecret"
                          placeholder={
                            defaultServerConfig?.authMethod === "bearer"
                              ? `Paste your ${defaultServerConfig.name} API key here`
                              : authMethod === "bearer"
                                ? "Paste the Bearer Token here"
                                : ""
                          }
                          disabled={authMethod !== "bearer"}
                          value={sharedSecret}
                          onChange={(e) => setSharedSecret(e.target.value)}
                          isError={
                            defaultServerConfig?.authMethod === "bearer" &&
                            !sharedSecret
                          }
                        />
                      </div>
                    )}
                    {!defaultServerConfig && authMethod === "oauth-static" && (
                      <div className="text-xs text-muted-foreground">
                        The redirect URI to allow is <strong>
                          {window.origin + "/oauth/mcp_static/finalize"}
                        </strong>
                      </div>
                    )}
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
            variant: "primary",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              void handleSave(e);
            },
            disabled:
              !isOAuthFormValid ||
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              (authorization && !useCase) ||
              (defaultServerConfig?.authMethod === "bearer" && !sharedSecret) ||
              (!internalMCPServer && !validateUrl(remoteServerUrl).valid) ||
              isLoading,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
