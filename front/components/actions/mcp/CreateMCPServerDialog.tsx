import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import { useSendNotification } from "@app/hooks/useNotification";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { AuthMethod } from "@app/lib/actions/mcp_remote_actions/remote_mcp_custom_headers";
import {
  addNewHeader,
  getDisplayHeaderKey,
  isValidHeaderKey,
  MCP_VALIDATION,
  removeHeader,
  updateHeaderKey,
  updateHeaderValue,
  validateCustomHeaders,
  validateCustomHeadersForSubmission,
} from "@app/lib/actions/mcp_remote_actions/remote_mcp_custom_headers";
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
  const [authMethod, setAuthMethod] = useState<AuthMethod>("none");
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(
    {}
  );
  const [isCustomAuthEnabled, setIsCustomAuthEnabled] = useState(false);
  const [useCase, setUseCase] = useState<MCPOAuthUseCase | null>(null);
  const [authCredentials, setAuthCredentials] =
    useState<OAuthCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOAuthFormValid, setIsOAuthFormValid] = useState(true);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );
  const [customHeadersErrors, setCustomHeadersErrors] = useState<string[]>([]);

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  useEffect(() => {
    if (defaultServerConfig?.url && isOpen) {
      setRemoteServerUrl(defaultServerConfig.url);
    }
    if (defaultServerConfig && isOpen) {
      if (defaultServerConfig.authMethod === "bearer") {
        setAuthMethod("bearer");
        setIsCustomAuthEnabled(true);
      } else {
        setAuthMethod("none");
        setIsCustomAuthEnabled(false);
      }
    }
  }, [defaultServerConfig, isOpen]);

  useEffect(() => {
    // Validate custom headers whenever they change
    if (isCustomAuthEnabled && authMethod === "custom-headers") {
      const errors = validateCustomHeaders(customHeaders);
      setCustomHeadersErrors(errors);
    } else {
      setCustomHeadersErrors([]);
    }
  }, [customHeaders, authMethod, isCustomAuthEnabled]);

  const isFormValid = useMemo(() => {
    const hasUrl =
      remoteServerUrl.trim() || defaultServerConfig?.url || internalMCPServer;
    const hasValidAuth =
      (!isCustomAuthEnabled && defaultServerConfig?.authMethod !== "bearer") ||
      (authMethod === "bearer" && sharedSecret?.trim()) ||
      (authMethod === "custom-headers" &&
        Object.keys(customHeaders).length > 0 &&
        customHeadersErrors.length === 0);

    return (
      hasUrl && hasValidAuth && isOAuthFormValid && (!authorization || useCase)
    );
  }, [
    remoteServerUrl,
    defaultServerConfig,
    internalMCPServer,
    isCustomAuthEnabled,
    authMethod,
    sharedSecret,
    customHeaders,
    customHeadersErrors,
    isOAuthFormValid,
    authorization,
    useCase,
  ]);

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
    setAuthMethod("none");
    setCustomHeaders({});
    setCustomHeadersErrors([]);
    setIsOAuthFormValid(true);
    setAuthorization(null);
    setIsCustomAuthEnabled(false);
  }, [setExternalIsLoading]);

  const handleCustomAuthToggle = useCallback((enabled: boolean) => {
    setIsCustomAuthEnabled(enabled);
    if (!enabled) {
      // When disabling custom auth, reset to none and clear auth data
      setAuthMethod("none");
      setSharedSecret(undefined);
      setCustomHeaders({});
      setCustomHeadersErrors([]);
    } else {
      // When enabling custom auth, default to bearer token
      setAuthMethod("bearer");
    }
  }, []);

  const handleAuthMethodChange = useCallback((newAuthMethod: AuthMethod) => {
    setAuthMethod(newAuthMethod);
    // Clear the other auth method's data
    if (newAuthMethod === "bearer") {
      setCustomHeaders({});
      setCustomHeadersErrors([]);
    } else if (newAuthMethod === "custom-headers") {
      setSharedSecret(undefined);
    }
  }, []);

  const handleSave = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    let oauthConnection: MCPConnectionType | undefined;
    setIsLoading(true);
    setError(null);

    if (
      !internalMCPServer &&
      !defaultServerConfig?.url &&
      !remoteServerUrl?.trim()
    ) {
      setError(MCP_VALIDATION.ERROR_MESSAGES.URL_REQUIRED);
      setIsLoading(false);
      return;
    }

    if (remoteServerUrl) {
      const urlValidation = validateUrl(remoteServerUrl);
      if (!urlValidation.valid) {
        setError(MCP_VALIDATION.ERROR_MESSAGES.INVALID_URL);
        setIsLoading(false);
        return;
      }
    }

    if (authMethod === "custom-headers") {
      const errors = validateCustomHeadersForSubmission(customHeaders);
      if (errors.length > 0) {
        setError(
          `${MCP_VALIDATION.ERROR_MESSAGES.CUSTOM_HEADERS_VALIDATION_FAILED}: ${errors.join(", ")}`
        );
        setIsLoading(false);
        return;
      }
    }

    if (authMethod === "bearer" && !sharedSecret?.trim()) {
      setError(MCP_VALIDATION.ERROR_MESSAGES.BEARER_TOKEN_REQUIRED);
      setIsLoading(false);
      return;
    }

    if (remoteServerUrl && !isCustomAuthEnabled) {
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
        customHeaders:
          authMethod === "custom-headers" &&
          Object.keys(customHeaders).length > 0
            ? customHeaders
            : undefined,
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
                        onChange={(e) => {
                          setRemoteServerUrl(e.target.value);
                          // Clear error when user starts typing a new URL
                          if (
                            error &&
                            (error ===
                              MCP_VALIDATION.ERROR_MESSAGES.URL_REQUIRED ||
                              error ===
                                MCP_VALIDATION.ERROR_MESSAGES.INVALID_URL)
                          ) {
                            setError(null);
                          }
                        }}
                        isError={
                          !!error &&
                          (error ===
                            MCP_VALIDATION.ERROR_MESSAGES.URL_REQUIRED ||
                            error === MCP_VALIDATION.ERROR_MESSAGES.INVALID_URL)
                        }
                        message={error}
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
              )}
              {defaultServerConfig?.authMethod !== "oauth" && (
                <>
                  <div className="space-y-2">
                    {defaultServerConfig?.authMethod === "bearer" ? (
                      <Label htmlFor="requiresBearerToken">
                        {defaultServerConfig.name} API Key
                      </Label>
                    ) : (
                      <div className="flex items-center justify-between">
                        <Label>Enable Custom Authentication</Label>
                        {!defaultServerConfig && (
                          <SliderToggle
                            size="xs"
                            selected={isCustomAuthEnabled}
                            onClick={() =>
                              handleCustomAuthToggle(!isCustomAuthEnabled)
                            }
                          />
                        )}
                      </div>
                    )}
                    {!defaultServerConfig && (
                      <div className="space-y-3">
                        {!isCustomAuthEnabled && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Dust will attempt to discover if OAuth
                            authentication is required. If not, the server will
                            be accessed without authentication. Enable custom
                            authentication if your server requires API keys or
                            tokens.
                          </div>
                        )}
                        {isCustomAuthEnabled && (
                          <div className="space-y-3">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Choose authentication method:
                            </div>
                            <div className="flex space-x-6">
                              <label className="flex cursor-pointer items-center space-x-2">
                                <input
                                  type="radio"
                                  name="authMethod"
                                  value="bearer"
                                  checked={authMethod === "bearer"}
                                  onChange={() =>
                                    handleAuthMethodChange("bearer")
                                  }
                                  className="text-primary"
                                />
                                <Label className="cursor-pointer text-sm font-medium text-gray-900 dark:text-gray-100">
                                  Bearer Token
                                </Label>
                              </label>
                              <label className="flex cursor-pointer items-center space-x-2">
                                <input
                                  type="radio"
                                  name="authMethod"
                                  value="custom-headers"
                                  checked={authMethod === "custom-headers"}
                                  onChange={() =>
                                    handleAuthMethodChange("custom-headers")
                                  }
                                  className="text-primary"
                                />
                                <Label className="cursor-pointer text-sm font-medium text-gray-900 dark:text-gray-100">
                                  Custom Headers
                                </Label>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isCustomAuthEnabled && authMethod === "bearer" && (
                      <div className="flex-grow">
                        <Input
                          id="sharedSecret"
                          placeholder={
                            defaultServerConfig
                              ? `Paste your ${defaultServerConfig.name} API key here`
                              : "Paste the Bearer Token here"
                          }
                          value={sharedSecret || ""}
                          onChange={(e) => setSharedSecret(e.target.value)}
                          isError={
                            !!error &&
                            error.includes(
                              MCP_VALIDATION.ERROR_MESSAGES
                                .BEARER_TOKEN_REQUIRED
                            )
                          }
                        />
                      </div>
                    )}

                    {isCustomAuthEnabled && authMethod === "custom-headers" && (
                      <div className="space-y-3">
                        {customHeadersErrors.length > 0 && (
                          <div className="space-y-1 text-sm text-red-600">
                            {customHeadersErrors.map((error, index) => (
                              <div key={index}>• {error}</div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-2">
                          {Object.entries(customHeaders).map(
                            ([key, value], index) => {
                              const totalHeaders =
                                Object.keys(customHeaders).length;
                              const isOnlyHeader = totalHeaders === 1;
                              const isEmpty = !key.trim() && !value.trim();

                              return (
                                <div
                                  key={`header-${index}`}
                                  className="flex space-x-2"
                                >
                                  <Input
                                    placeholder="Header name"
                                    value={getDisplayHeaderKey(key)}
                                    onChange={(e) => {
                                      const newKey = e.target.value;
                                      setCustomHeaders(
                                        updateHeaderKey(
                                          customHeaders,
                                          key,
                                          newKey
                                        )
                                      );
                                    }}
                                    isError={
                                      !isValidHeaderKey(
                                        getDisplayHeaderKey(key)
                                      )
                                    }
                                  />
                                  <Input
                                    placeholder="Header value"
                                    value={value}
                                    onChange={(e) => {
                                      setCustomHeaders(
                                        updateHeaderValue(
                                          customHeaders,
                                          key,
                                          e.target.value
                                        )
                                      );
                                    }}
                                    isError={!value.trim() && key.trim() !== ""}
                                  />
                                  {isOnlyHeader && isEmpty ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      label="Remove"
                                      disabled
                                      className="opacity-50"
                                    />
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      label="Remove"
                                      onClick={() => {
                                        setCustomHeaders(
                                          removeHeader(customHeaders, key)
                                        );
                                      }}
                                    />
                                  )}
                                </div>
                              );
                            }
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            label="Add Header"
                            onClick={() => {
                              setCustomHeaders(addNewHeader(customHeaders));
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}

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
            onClick: handleSave,
            disabled: !isFormValid || isLoading,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
