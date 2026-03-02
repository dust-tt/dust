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
} from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import {
  AUTH_CREDENTIALS_ERROR_KEY,
  MCPServerOAuthConnexion,
} from "@app/components/actions/mcp/MCPServerOAuthConnexion";
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
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

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
}

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
  const regionContext = useRegionContext();

  const defaultValues = useMemo<CreateMCPServerDialogFormValues>(() => {
    return getCreateMCPServerDialogDefaultValues(defaultServerConfig);
  }, [defaultServerConfig]);

  const form = useForm<CreateMCPServerDialogFormValues>({
    resolver: zodResolver(createMCPServerDialogFormSchema),
    defaultValues,
    mode: "onChange",
    shouldUnregister: false,
  });

  // Check for credential validation errors set by MCPServerOAuthConnexion.
  const hasCredentialErrors =
    !!form.formState.errors[AUTH_CREDENTIALS_ERROR_KEY];

  const useCase = useWatch({
    control: form.control,
    name: "useCase",
  });

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

  const createdServerRef = useRef<MCPServerType | null>(null);

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

  const resetState = () => {
    setIsLoading(false);
    setExternalIsLoading(false);
    // Reset workflow state (useState).
    setAuthorization(null);
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setIsStaticFormValid(false);
    createdServerRef.current = null;
    // Reset form state.
    form.reset(defaultValues);
  };

  const handleSave = async (values: CreateMCPServerDialogFormValues) => {
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

  const handleStaticCredentialCreated = useCallback(
    async (credentialId: string) => {
      const createdServer = createdServerRef.current;
      if (!authorization || !useCase || !createdServer) {
        return;
      }

      const connectionCreationRes = await createMCPServerConnection({
        credentialId,
        mcpServerId: createdServer.sId,
        mcpServerDisplayName: getMcpServerDisplayName(createdServer),
        provider: authorization.provider,
      });
      if (!connectionCreationRes) {
        setIsLoading(false);
        setExternalIsLoading(false);
        return;
      }

      sendNotification({
        title: "Success",
        type: "success",
        description: `${getMcpServerDisplayName(createdServer)} added successfully.`,
      });
      setMCPServerToShow(createdServer);
      setExternalIsLoading(false);
      setIsLoading(false);
      setIsOpen(false);
    },
    [
      authorization,
      useCase,
      setIsOpen,
      setExternalIsLoading,
      setMCPServerToShow,
      createMCPServerConnection,
      sendNotification,
    ]
  );

  const handleCreateServerAndSubmitStaticCredentials = async () => {
    if (!internalMCPServer || !useCase) {
      return;
    }

    setIsLoading(true);
    setExternalIsLoading(true);

    // Create the internal server without an OAuth connection.
    const createRes = await createInternalMCPServer({
      name: internalMCPServer.name,
      useCase,
      includeGlobal: true,
    });

    if (createRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to create server",
        description: createRes.error.message,
      });
      setIsLoading(false);
      setExternalIsLoading(false);
      return;
    }

    // Store created server so handleStaticCredentialCreated can use it.
    createdServerRef.current = createRes.value.server;

    // Trigger the static form submission (creates credential, calls onCredentialCreated).
    const success = await staticFormRef.current?.submit();
    if (!success) {
      setIsLoading(false);
      setExternalIsLoading(false);
    }
  };

  const staticFormRef = useRef<StaticCredentialFormHandle>(null);
  const [isStaticFormValid, setIsStaticFormValid] = useState(false);

  const staticFormComponent =
    authorization && useCase
      ? getStaticCredentialForm(authorization.provider, useCase)
      : null;
  const hasStaticForm = !!staticFormComponent;

  const staticCredentialConfig: StaticCredentialConfig | undefined =
    useMemo(() => {
      if (!staticFormComponent) {
        return undefined;
      }
      return {
        owner,
        formRef: staticFormRef,
        onValidityChange: setIsStaticFormValid,
        onCredentialCreated: handleStaticCredentialCreated,
        FormComponent: staticFormComponent,
      };
    }, [owner, handleStaticCredentialCreated, staticFormComponent]);

  // When OAuth is required (authorization is set), form is valid when:
  // - use case is selected AND either static form or OAuth credentials are valid.
  // When no OAuth needed (no authorization), form is always valid for OAuth fields.
  const isOAuthValid = authorization
    ? !!useCase && (hasStaticForm ? isStaticFormValid : !hasCredentialErrors)
    : true;
  const isSubmitDisabled = !isOAuthValid || isLoading;

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
              {!internalMCPServer &&
                (!authorization || authorization.provider === "mcp_static") && (
                  <RemoteMCPServerConfigurationSection
                    defaultServerConfig={defaultServerConfig}
                    onAuthorizationChange={setAuthorization}
                  />
                )}

              {authorization && (
                <MCPServerOAuthConnexion
                  toolName={toolName}
                  authorization={authorization}
                  documentationUrl={
                    internalMCPServer?.documentationUrl ?? undefined
                  }
                  staticCredentialConfig={staticCredentialConfig}
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
                  // handleSubmit gates on form validity (including errors set via setError).
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
