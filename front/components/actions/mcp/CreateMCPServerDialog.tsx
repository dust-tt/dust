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
  SliderToggle,
  Tooltip,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type {
  AuthMethod,
  CreateMCPServerFormValues,
} from "@app/components/actions/mcp/forms/createMCPServerFormSchema";
import {
  getCreateMCPServerFormDefaults,
  isFormSubmittable,
} from "@app/components/actions/mcp/forms/createMCPServerFormSchema";
import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerDisplayName,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { MCPConnectionType } from "@app/lib/swr/mcp_servers";
import {
  useCreateInternalMCPServer,
  useCreateRemoteMCPServer,
  useDiscoverOAuthMetadata,
} from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";
import {
  OAUTH_PROVIDER_NAMES,
  sanitizeHeadersArray,
  setupOAuthConnection,
  validateUrl,
} from "@app/types";

import { McpServerHeaders } from "./MCPServerHeaders";

type CreateMCPServerDialogProps = {
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
}: CreateMCPServerDialogProps) {
  const sendNotification = useSendNotification();

  // Non-form state (these are transient/derived state, not form data)
  const [
    remoteMCPServerOAuthDiscoveryDone,
    setRemoteMCPServerOAuthDiscoveryDone,
  ] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOAuthFormValid, setIsOAuthFormValid] = useState(true);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );

  // Form state managed by React Hook Form
  const defaults = useMemo(
    () =>
      getCreateMCPServerFormDefaults({
        internalMCPServer,
        defaultServerConfig,
      }),
    [internalMCPServer, defaultServerConfig]
  );

  const form = useForm<CreateMCPServerFormValues>({
    defaultValues: defaults,
    mode: "onChange",
  });

  const {
    watch,
    setValue,
    reset: formReset,
    getValues,
  } = form;

  // Watch form values for reactive updates
  const remoteServerUrl = watch("remoteServerUrl");
  const authMethod = watch("authMethod");
  const sharedSecret = watch("sharedSecret");
  const useCase = watch("useCase");
  const authCredentials = watch("authCredentials");
  const useCustomHeaders = watch("useCustomHeaders");
  const customHeaders = watch("customHeaders");

  const sanitizeHeaders = useCallback(
    (headers: { key: string; value: string }[]) =>
      sanitizeHeadersArray(headers),
    []
  );

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  const requiresBearerToken = internalMCPServer
    ? requiresBearerTokenConfiguration(internalMCPServer)
    : false;

  // Reset form when dialog opens with new config
  useEffect(() => {
    if (isOpen) {
      formReset(
        getCreateMCPServerFormDefaults({
          internalMCPServer,
          defaultServerConfig,
        })
      );
    }
  }, [isOpen, internalMCPServer, defaultServerConfig, formReset]);

  // Initialize authorization from internalMCPServer
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
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setIsOAuthFormValid(true);
    setAuthorization(null);
    formReset(defaults);
  }, [setExternalIsLoading, formReset, defaults]);

  const handleSave = async (e: React.MouseEvent<HTMLButtonElement>) => {
    let oauthConnection: MCPConnectionType | undefined;
    setIsLoading(true);

    const formValues = getValues();

    if (formValues.remoteServerUrl) {
      const urlValidation = validateUrl(formValues.remoteServerUrl);

      if (!urlValidation.valid) {
        e.preventDefault();
        setError(
          "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
        );
        setIsLoading(false);
        return;
      }

      if (formValues.authMethod === "oauth-dynamic") {
        if (!remoteMCPServerOAuthDiscoveryDone) {
          const discoverOAuthMetadataRes = await discoverOAuthMetadata(
            formValues.remoteServerUrl,
            formValues.useCustomHeaders
              ? sanitizeHeaders(formValues.customHeaders)
              : undefined
          );
          setRemoteMCPServerOAuthDiscoveryDone(true);

          if (discoverOAuthMetadataRes.isOk()) {
            if (discoverOAuthMetadataRes.value.oauthRequired) {
              setAuthorization({
                provider: "mcp",
                supported_use_cases: ["platform_actions", "personal_actions"],
              });

              setValue(
                "authCredentials",
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
              description: `${discoverOAuthMetadataRes.error.message} (${formValues.remoteServerUrl})`,
            });
            setRemoteMCPServerOAuthDiscoveryDone(false);
            setIsLoading(false);
            return;
          }
        }
      }
    }

    if (authorization && !formValues.useCase) {
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
          ...(formValues.authCredentials ?? {}),
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
        useCase: formValues.useCase!,
        connectionId: cRes.value.connection_id,
      };
    }

    // Then, create the server, either internal or remote.
    setExternalIsLoading(true);
    let server: MCPServerType | undefined;
    if (internalMCPServer) {
      const sanitizedHeaders =
        requiresBearerTokenConfiguration(internalMCPServer) &&
        formValues.customHeaders.length > 0
          ? sanitizeHeadersArray(formValues.customHeaders)
          : undefined;

      const createRes = await createInternalMCPServer({
        name: internalMCPServer.name,
        oauthConnection,
        includeGlobal: true,
        ...(requiresBearerTokenConfiguration(internalMCPServer) &&
        (formValues.sharedSecret !== undefined ||
          formValues.customHeaders.length > 0)
          ? {
              sharedSecret: formValues.sharedSecret || undefined,
              customHeaders:
                sanitizedHeaders && sanitizedHeaders.length > 0
                  ? sanitizedHeaders
                  : undefined,
            }
          : {}),
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

    if (formValues.remoteServerUrl) {
      const createRes = await createWithURL({
        url: formValues.remoteServerUrl,
        includeGlobal: true,
        sharedSecret:
          formValues.authMethod === "bearer"
            ? formValues.sharedSecret || undefined
            : undefined,
        oauthConnection,
        customHeaders: formValues.useCustomHeaders
          ? sanitizeHeaders(formValues.customHeaders)
          : undefined,
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

  const getAuthMethodLabel = () => {
    if (authMethod === "oauth-dynamic") {
      return "Automatic";
    }
    if (authMethod === "bearer") {
      return defaultServerConfig?.authMethod === "bearer"
        ? `${defaultServerConfig.name} API Key`
        : "Bearer token";
    }
    return "Static OAuth";
  };

  const handleAuthMethodChange = (newMethod: AuthMethod) => {
    setValue("authMethod", newMethod);
    if (newMethod === "oauth-static") {
      setAuthorization({
        provider: "mcp_static",
        supported_use_cases: ["platform_actions", "personal_actions"],
      });
      setIsOAuthFormValid(false);
    } else {
      setAuthorization(null);
      setIsOAuthFormValid(true);
    }
  };

  const toolName: string = useMemo(() => {
    if (internalMCPServer) {
      return getMcpServerDisplayName(internalMCPServer);
    }
    if (defaultServerConfig) {
      return defaultServerConfig.name;
    }
    return "MCP Server";
  }, [internalMCPServer, defaultServerConfig]);

  const toolIcon: InternalAllowedIconType | CustomResourceIconType =
    useMemo(() => {
      if (internalMCPServer) {
        return internalMCPServer.icon;
      }
      if (defaultServerConfig) {
        return defaultServerConfig.icon;
      }
      return DEFAULT_MCP_SERVER_ICON;
    }, [internalMCPServer, defaultServerConfig]);

  const isSubmitDisabled = !isFormSubmittable(getValues(), {
    internalMCPServer,
    defaultServerConfig,
    authorization,
    requiresBearerToken,
    isOAuthFormValid,
    isLoading,
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        resetState();
      }}
    >
      <DialogContent size="xl" height="xl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              {getAvatarFromIcon(toolIcon, "sm")}
              <span>Configure {toolName}</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-4">
            {!internalMCPServer &&
              (!authorization || authorization.provider === "mcp_static") && (
                <>
                  {defaultServerConfig && (
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                        {defaultServerConfig.description}
                        {defaultServerConfig.documentationUrl && (
                          <>
                            {" "}
                            <a
                              href={defaultServerConfig.documentationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline dark:text-primary-night"
                            >
                              See {defaultServerConfig.name} documentation.
                            </a>
                          </>
                        )}
                      </p>
                      {defaultServerConfig.connectionInstructions && (
                        <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
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
                            onChange={(e) =>
                              setValue("remoteServerUrl", e.target.value)
                            }
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
                              label={getAuthMethodLabel()}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuRadioGroup value={authMethod}>
                              {!defaultServerConfig && (
                                <DropdownMenuRadioItem
                                  value="oauth-dynamic"
                                  label="Automatic"
                                  onClick={() =>
                                    handleAuthMethodChange("oauth-dynamic")
                                  }
                                />
                              )}
                              {(!defaultServerConfig ||
                                defaultServerConfig?.authMethod ===
                                  "bearer") && (
                                <DropdownMenuRadioItem
                                  value="bearer"
                                  label={
                                    defaultServerConfig?.authMethod === "bearer"
                                      ? `${defaultServerConfig.name} API Key`
                                      : "Bearer token"
                                  }
                                  onClick={() =>
                                    handleAuthMethodChange("bearer")
                                  }
                                />
                              )}
                              {!defaultServerConfig && (
                                <DropdownMenuRadioItem
                                  value="oauth-static"
                                  label="Static OAuth"
                                  onClick={() =>
                                    handleAuthMethodChange("oauth-static")
                                  }
                                />
                              )}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {(authMethod === "oauth-dynamic" ||
                        defaultServerConfig?.authMethod ===
                          "oauth-dynamic") && (
                        <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                          Dust will automatically discover if OAuth
                          authentication is required. If OAuth is not needed,
                          the server will be accessed without authentication.
                          Otherwise, Dust will try to use dynamic client
                          registration to get the OAuth credentials.
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
                            onChange={(e) =>
                              setValue("sharedSecret", e.target.value)
                            }
                            isError={
                              defaultServerConfig?.authMethod === "bearer" &&
                              !sharedSecret
                            }
                          />
                        </div>
                      )}
                      {!defaultServerConfig &&
                        authMethod === "oauth-static" && (
                          <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                            The redirect URI to allow is{" "}
                            <strong>
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
                toolName={toolName}
                authorization={authorization}
                authCredentials={authCredentials}
                useCase={useCase}
                setUseCase={(uc) => setValue("useCase", uc)}
                setAuthCredentials={(creds) =>
                  setValue("authCredentials", creds)
                }
                setIsFormValid={setIsOAuthFormValid}
                documentationUrl={
                  internalMCPServer?.documentationUrl ?? undefined
                }
              />
            )}

            {internalMCPServer &&
              requiresBearerTokenConfiguration(internalMCPServer) && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="bearerToken">
                      Bearer Token (Authorization)
                    </Label>
                    <Tooltip
                      trigger={
                        <Icon
                          visual={InformationCircleIcon}
                          size="xs"
                          className="text-gray-400"
                        />
                      }
                      label="This will be sent alongside the request as a Bearer token in the Authorization header."
                    />
                  </div>
                  <Input
                    id="bearerToken"
                    placeholder="Paste the Bearer Token here"
                    value={sharedSecret ?? ""}
                    onChange={(e) => setValue("sharedSecret", e.target.value)}
                    isError={!sharedSecret}
                    message={
                      !sharedSecret ? "Bearer token is required" : undefined
                    }
                  />
                </div>
              )}

            {!defaultServerConfig &&
              (!internalMCPServer ||
                requiresBearerTokenConfiguration(internalMCPServer)) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="customHeaders">Use custom headers</Label>
                      <Tooltip
                        trigger={
                          <Icon
                            visual={InformationCircleIcon}
                            size="xs"
                            className="text-gray-400"
                          />
                        }
                        label="Custom headers can be added for advanced networking such as firewalls."
                      />
                    </div>
                    <SliderToggle
                      disabled={false}
                      selected={useCustomHeaders}
                      onClick={() =>
                        setValue("useCustomHeaders", !useCustomHeaders)
                      }
                    />
                  </div>
                </div>
              )}

            {useCustomHeaders && (
              <McpServerHeaders
                headers={customHeaders}
                onHeadersChange={(headers) =>
                  setValue("customHeaders", headers)
                }
              />
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: () => {
              setIsOpen(false);
              resetState();
            },
          }}
          rightButtonProps={{
            isLoading: isLoading,
            label: isLoading
              ? "Loading..."
              : authorization
                ? "Setup connection"
                : "Save",
            variant: "primary",
            disabled: isSubmitDisabled,
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              void handleSave(e);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
