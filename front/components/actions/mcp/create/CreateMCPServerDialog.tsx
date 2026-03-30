import { CustomHeadersConfigurationSection } from "@app/components/actions/mcp/create/CustomHeadersConfigurationSection";
import { InternalBearerTokenSection } from "@app/components/actions/mcp/create/InternalBearerTokenSection";
import { RemoteMCPServerConfigurationSection } from "@app/components/actions/mcp/create/RemoteMCPServerConfigurationSection";
import { getStaticCredentialForm } from "@app/components/actions/mcp/create/static_credential_forms";
import { submitCreateMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitCreateMCPServerDialogForm";
import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import { createMCPServerDialogFormSchema } from "@app/components/actions/mcp/forms/types";
import {
  getCreateMCPServerDialogDefaultValues,
  handleCreateMCPServerDialogSubmitError,
} from "@app/components/actions/mcp/forms/utils";
import type {
  StaticCredentialConfig,
  StaticCredentialFormHandle,
} from "@app/components/actions/mcp/MCPServerAuthConnection";
import { MCPServerAuthConnection } from "@app/components/actions/mcp/MCPServerAuthConnection";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerDisplayName,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import {
  useCreateInternalMCPServer,
  useCreateMCPServerConnection,
  useCreateRemoteMCPServer,
  useDiscoverOAuthMetadata,
} from "@app/lib/swr/mcp_servers";
import { validateOAuthCredentials } from "@app/types/oauth/lib";
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

/**
 * Generate a unique view name for a multi-instance MCP server by trying
 * incrementing suffixes until one is not already taken.
 */
export function generateUniqueViewName(
  baseName: string,
  existingViewNames: string[]
): string {
  const existingSet = new Set(existingViewNames);
  let index = 2;
  let candidate = `${baseName}_${index}`;
  while (existingSet.has(candidate)) {
    index += 1;
    candidate = `${baseName}_${index}`;
  }
  return candidate;
}

function getSubmitButtonLabel(
  isLoading: boolean,
  authorization: AuthorizationInfo | null,
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): string {
  if (isLoading) {
    return "Loading...";
  }
  if (authorization) {
    return "Setup connection";
  }
  // Use "Next" for OAuth servers, "Save" for others
  if (defaultServerConfig?.authMethod === "oauth-dynamic") {
    return "Next";
  }
  return "Save";
}

interface CreateMCPServerDialogProps {
  owner: WorkspaceType;
  internalMCPServer?: MCPServerType;
  setMCPServerToShow: (server: MCPServerType) => void;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
  existingViewNames?: string[];
}

export function CreateMCPServerDialog({
  owner,
  internalMCPServer,
  setMCPServerToShow,
  setIsLoading: setExternalIsLoading,
  isOpen = false,
  setIsOpen,
  defaultServerConfig,
  existingViewNames = [],
}: CreateMCPServerDialogProps) {
  const sendNotification = useSendNotification();
  const regionContext = useRegionContext();

  // Determine if this is a multi-instance server that already has an existing instance.
  const needsCustomName = useMemo(
    () =>
      !!internalMCPServer?.allowMultipleInstances &&
      existingViewNames.includes(internalMCPServer.name),
    [internalMCPServer, existingViewNames]
  );

  const suggestedViewName = useMemo(
    () =>
      needsCustomName && internalMCPServer
        ? generateUniqueViewName(internalMCPServer.name, existingViewNames)
        : undefined,
    [needsCustomName, internalMCPServer, existingViewNames]
  );

  const defaultValues = useMemo<CreateMCPServerDialogFormValues>(() => {
    return {
      ...getCreateMCPServerDialogDefaultValues(defaultServerConfig),
      viewName: suggestedViewName,
    };
  }, [defaultServerConfig, suggestedViewName]);

  const form = useForm<CreateMCPServerDialogFormValues>({
    resolver: zodResolver(createMCPServerDialogFormSchema),
    defaultValues,
    mode: "onChange",
    shouldUnregister: false,
  });

  const useCase = useWatch({
    control: form.control,
    name: "useCase",
  });

  const authCredentials = useWatch({
    control: form.control,
    name: "authCredentials",
  });

  const viewName = useWatch({
    control: form.control,
    name: "viewName",
  });

  const selectedScopes = useWatch({
    control: form.control,
    name: "selectedScopes",
  });

  // Client-side validation for the view name field.
  const viewNameError = useMemo(() => {
    if (!needsCustomName) {
      return null;
    }
    const trimmed = (viewName ?? "").trim();
    if (trimmed.length === 0) {
      return "Name is required.";
    }
    if (existingViewNames.includes(trimmed)) {
      return "This name is already in use.";
    }
    return null;
  }, [needsCustomName, viewName, existingViewNames]);

  const [isLoading, setIsLoading] = useState(false);

  // Workflow state - managed via useState, not form state.
  // These are server-derived values (from OAuth discovery or internal server config),
  // not user input. Keeping them separate maintains clear separation of concerns.
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );
  const [
    remoteMCPServerOAuthDiscoveryDone,
    setRemoteMCPServerOAuthDiscoveryDone,
  ] = useState(false);

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(defaultValues);
    }
  }, [defaultValues, form, isOpen]);

  // Initialize authorization from internalMCPServer when dialog opens.
  useEffect(() => {
    if (internalMCPServer && isOpen) {
      setAuthorization(internalMCPServer.authorization);
    }
  }, [internalMCPServer, isOpen]);

  // Initialize authorization for oauth-static remote servers when dialog opens.
  useEffect(() => {
    if (defaultServerConfig?.authMethod === "oauth-static" && isOpen) {
      setAuthorization({
        provider: "mcp_static",
        supported_use_cases: defaultServerConfig.supportedOAuthUseCases ?? [],
      });
    }
  }, [defaultServerConfig, isOpen]);

  // Initialize selectedScopes to all available scopes when authorization changes.
  useEffect(() => {
    if (authorization?.availableScopes) {
      form.setValue(
        "selectedScopes",
        authorization.availableScopes.map((s) => s.value)
      );
    }
  }, [authorization, form]);

  const resetState = () => {
    setIsLoading(false);
    setExternalIsLoading(false);
    // Reset workflow state (useState).
    setAuthorization(null);
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setIsStaticFormValid(false);
    // Reset form state.
    form.reset(defaultValues);
  };

  const handleSave = async (values: CreateMCPServerDialogFormValues) => {
    // Guard: handleSubmit only checks Zod schema errors, not manual setError errors.
    if (credentialError || viewNameError) {
      return;
    }

    setIsLoading(true);

    const submitRes = await submitCreateMCPServerDialogForm({
      owner,
      internalMCPServer,
      values,
      // Pass workflow state as separate params (not from form).
      authorization,
      remoteMCPServerOAuthDiscoveryDone,
      discoverOAuthMetadata,
      createWithURL,
      createInternalMCPServer,
      onBeforeCreateServer: () => setExternalIsLoading(true),
      regionInfo: regionContext.regionInfo,
    });

    if (submitRes.isErr()) {
      handleCreateMCPServerDialogSubmitError({
        error: submitRes.error,
        context: {
          remoteServerUrl: values.remoteServerUrl,
          provider: authorization?.provider ?? null,
        },
        sendNotification: (title, description) =>
          sendNotification({ type: "error", title, description }),
        loading: {
          setIsLoading,
          setExternalIsLoading,
          setRemoteMCPServerOAuthDiscoveryDone,
        },
      });
      return;
    }

    // Update workflow state from submit result.
    setRemoteMCPServerOAuthDiscoveryDone(
      submitRes.value.remoteMCPServerOAuthDiscoveryDone
    );

    if (submitRes.value.type === "oauth_required") {
      setAuthorization(submitRes.value.authorization);
      form.setValue("authCredentials", submitRes.value.authCredentials);
      // Returning here as now the user must select the use case.
      setIsLoading(false);
      return;
    }

    sendNotification({
      title: "Success",
      type: "success",
      description: `${getMcpServerDisplayName(submitRes.value.server)} added successfully.`,
    });
    setMCPServerToShow(submitRes.value.server);
    setExternalIsLoading(false);
    setIsLoading(false);
    setIsOpen(false);
    resetState();
  };

  const toolName = useMemo(() => {
    if (internalMCPServer) {
      return getMcpServerDisplayName(internalMCPServer);
    }
    if (defaultServerConfig) {
      return defaultServerConfig.name;
    }
    return "MCP Server";
  }, [internalMCPServer, defaultServerConfig]);

  const toolIcon = useMemo(() => {
    if (internalMCPServer) {
      return internalMCPServer.icon;
    }
    if (defaultServerConfig) {
      return defaultServerConfig.icon;
    }
    return DEFAULT_MCP_SERVER_ICON;
  }, [internalMCPServer, defaultServerConfig]);

  const staticFormRef = useRef<StaticCredentialFormHandle>(null);
  const [isStaticFormValid, setIsStaticFormValid] = useState(false);

  const staticFormComponent =
    authorization && useCase
      ? getStaticCredentialForm(authorization.provider, useCase)
      : null;
  const hasStaticForm = !!staticFormComponent;

  const staticCredentialConfig: StaticCredentialConfig | undefined =
    staticFormComponent
      ? {
          owner,
          formRef: staticFormRef,
          onValidityChange: setIsStaticFormValid,
          FormComponent: staticFormComponent,
        }
      : undefined;

  // Synchronous validation — no race condition with useEffect.
  const credentialError = useMemo(
    () =>
      authorization
        ? validateOAuthCredentials({
            provider: authorization.provider,
            useCase: useCase ?? null,
            authCredentials: authCredentials ?? null,
          })
        : null,
    [authorization, useCase, authCredentials]
  );

  const handleCreateServerAndSubmitStaticCredentials = async () => {
    if (!internalMCPServer || !authorization || !useCase || viewNameError) {
      return;
    }

    setIsLoading(true);
    setExternalIsLoading(true);

    try {
      // Create the internal server without an OAuth connection.
      const createRes = await createInternalMCPServer({
        name: internalMCPServer.name,
        useCase,
        includeGlobal: true,
        viewName: form.getValues("viewName"),
      });

      if (createRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to create server",
          description: createRes.error.message,
        });
        return;
      }

      const createdServer = createRes.value.server;

      // Submit the static credential form — returns credentialId or null.
      const credentialId = await staticFormRef.current?.submit();
      if (!credentialId) {
        return;
      }

      const connectionCreationRes = await createMCPServerConnection({
        credentialId,
        mcpServerId: createdServer.sId,
        mcpServerDisplayName: getMcpServerDisplayName(createdServer),
        provider: authorization.provider,
      });
      if (!connectionCreationRes) {
        return;
      }

      sendNotification({
        title: "Success",
        type: "success",
        description: `${getMcpServerDisplayName(createdServer)} added successfully.`,
      });
      setMCPServerToShow(createdServer);
      setIsOpen(false);
      resetState();
    } finally {
      setIsLoading(false);
      setExternalIsLoading(false);
    }
  };

  // When OAuth is required (authorization is set), form is valid when:
  // - use case is selected AND either static form or OAuth credentials are valid.
  // When no OAuth needed (no authorization), form is always valid for OAuth fields.
  const isOAuthValid = authorization
    ? !!useCase && (hasStaticForm ? isStaticFormValid : !credentialError)
    : true;
  const isSubmitDisabled = !isOAuthValid || isLoading || !!viewNameError;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        resetState();
      }}
    >
      <DialogContent size="xl" onClick={(e) => e.stopPropagation()}>
        <FormProvider form={form} asForm={false}>
          <DialogHeader>
            <DialogTitle visual={getAvatarFromIcon(toolIcon, "sm")}>
              Configure {toolName}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer className="max-h-[80vh]">
            <div className="space-y-4">
              {needsCustomName && (
                <div className="space-y-4">
                  <div className="heading-lg text-foreground dark:text-foreground-night">
                    Tool name
                  </div>
                  <Input
                    placeholder="Enter a name for this instance"
                    {...form.register("viewName")}
                    isError={!!viewNameError}
                    message={
                      viewNameError ??
                      `${toolName} is already installed. This name tells them apart.`
                    }
                    messageStatus={viewNameError ? "error" : "info"}
                  />
                </div>
              )}

              {!internalMCPServer &&
                (!authorization || authorization.provider === "mcp_static") && (
                  <RemoteMCPServerConfigurationSection
                    defaultServerConfig={defaultServerConfig}
                    onAuthorizationChange={setAuthorization}
                  />
                )}

              {authorization && (
                <MCPServerAuthConnection
                  toolName={toolName}
                  authorization={authorization}
                  documentationUrl={
                    internalMCPServer?.documentationUrl ??
                    defaultServerConfig?.documentationUrl ??
                    undefined
                  }
                  staticCredentialConfig={staticCredentialConfig}
                  selectedScopes={selectedScopes}
                  onSelectedScopesChange={(scopes) =>
                    form.setValue("selectedScopes", scopes)
                  }
                  serverId={defaultServerConfig?.id}
                />
              )}

              {internalMCPServer &&
                requiresBearerTokenConfiguration(internalMCPServer) && (
                  <InternalBearerTokenSection
                    serverName={internalMCPServer.name}
                  />
                )}

              <CustomHeadersConfigurationSection
                defaultServerConfig={defaultServerConfig}
                internalMCPServer={internalMCPServer}
              />
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
              label: hasStaticForm
                ? "Connect"
                : getSubmitButtonLabel(
                    isLoading,
                    authorization,
                    defaultServerConfig
                  ),
              variant: "primary",
              disabled: isSubmitDisabled,
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (hasStaticForm) {
                  void handleCreateServerAndSubmitStaticCredentials();
                } else {
                  void form.handleSubmit(handleSave)();
                }
              },
            }}
          />
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
