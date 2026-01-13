import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { CustomHeadersConfigurationSection } from "@app/components/actions/mcp/create/CustomHeadersConfigurationSection";
import { InternalBearerTokenSection } from "@app/components/actions/mcp/create/InternalBearerTokenSection";
import { RemoteMCPServerConfigurationSection } from "@app/components/actions/mcp/create/RemoteMCPServerConfigurationSection";
import { submitCreateMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitCreateMCPServerDialogForm";
import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import { createMCPServerDialogFormSchema } from "@app/components/actions/mcp/forms/types";
import {
  getCreateMCPServerDialogDefaultValues,
  handleCreateMCPServerDialogSubmitError,
} from "@app/components/actions/mcp/forms/utils";
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
import {
  useCreateInternalMCPServer,
  useCreateRemoteMCPServer,
  useDiscoverOAuthMetadata,
} from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

function getSubmitButtonLabel(
  isLoading: boolean,
  authorization: AuthorizationInfo | null
): string {
  if (isLoading) {
    return "Loading...";
  }
  if (authorization) {
    return "Setup connection";
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

  const defaultValues = useMemo<CreateMCPServerDialogFormValues>(() => {
    return getCreateMCPServerDialogDefaultValues(defaultServerConfig);
  }, [defaultServerConfig]);

  const form = useForm<CreateMCPServerDialogFormValues>({
    resolver: zodResolver(createMCPServerDialogFormSchema),
    defaultValues,
    shouldUnregister: false,
  });

  // Check for credential validation errors set by MCPServerOAuthConnexion.
  const hasCredentialErrors =
    !!form.formState.errors[AUTH_CREDENTIALS_ERROR_KEY];

  const useCase = useWatch({
    control: form.control,
    name: "useCase",
  });

  // Watch workflow state from form instead of separate useState.
  const authorization = useWatch({
    control: form.control,
    name: "authorization",
  });
  const remoteMCPServerOAuthDiscoveryDone = useWatch({
    control: form.control,
    name: "remoteMCPServerOAuthDiscoveryDone",
  });

  const [isLoading, setIsLoading] = useState(false);

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  // Initialize authorization from internalMCPServer when dialog opens.
  useEffect(() => {
    if (internalMCPServer && isOpen) {
      form.setValue("authorization", internalMCPServer.authorization);
    } else if (!isOpen) {
      // Reset when dialog closes - handled by resetState on close
    }
  }, [form, internalMCPServer, isOpen]);

  const resetState = () => {
    setIsLoading(false);
    setExternalIsLoading(false);
    form.reset(defaultValues);
  };

  const handleSave = async (values: CreateMCPServerDialogFormValues) => {
    setIsLoading(true);

    const submitRes = await submitCreateMCPServerDialogForm({
      owner,
      internalMCPServer,
      values,
      discoverOAuthMetadata,
      createWithURL,
      createInternalMCPServer,
      onBeforeCreateServer: () => setExternalIsLoading(true),
    });

    if (submitRes.isErr()) {
      handleCreateMCPServerDialogSubmitError({
        error: submitRes.error,
        context: {
          remoteServerUrl: values.remoteServerUrl,
          provider: values.authorization?.provider ?? null,
        },
        sendNotification: (title, description) =>
          sendNotification({ type: "error", title, description }),
        loading: {
          setIsLoading,
          setExternalIsLoading,
          setRemoteMCPServerOAuthDiscoveryDone: (done: boolean) =>
            form.setValue("remoteMCPServerOAuthDiscoveryDone", done),
        },
      });
      return;
    }

    form.setValue(
      "remoteMCPServerOAuthDiscoveryDone",
      submitRes.value.remoteMCPServerOAuthDiscoveryDone
    );

    if (submitRes.value.type === "oauth_required") {
      form.setValue("authorization", submitRes.value.authorization);
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

  // When OAuth is required (authorization is set), form is valid when:
  // - use case is selected AND no credential validation errors.
  // When no OAuth needed (no authorization), form is always valid for OAuth fields.
  const isOAuthValid = authorization ? !!useCase && !hasCredentialErrors : true;
  const isSubmitDisabled = !isOAuthValid || isLoading;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        resetState();
      }}
    >
      <DialogContent size="xl" height="xl" onClick={(e) => e.stopPropagation()}>
        <FormProvider form={form} asForm={false}>
          <DialogHeader>
            <DialogTitle visual={getAvatarFromIcon(toolIcon, "sm")}>
              Configure {toolName}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="space-y-4">
              {!internalMCPServer &&
                (!authorization || authorization.provider === "mcp_static") && (
                  <RemoteMCPServerConfigurationSection
                    defaultServerConfig={defaultServerConfig}
                  />
                )}

              {authorization && (
                <MCPServerOAuthConnexion
                  toolName={toolName}
                  documentationUrl={
                    internalMCPServer?.documentationUrl ?? undefined
                  }
                />
              )}

              {internalMCPServer &&
                requiresBearerTokenConfiguration(internalMCPServer) && (
                  <InternalBearerTokenSection />
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
              label: getSubmitButtonLabel(isLoading, authorization),
              variant: "primary",
              disabled: isSubmitDisabled,
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isOAuthValid) {
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
