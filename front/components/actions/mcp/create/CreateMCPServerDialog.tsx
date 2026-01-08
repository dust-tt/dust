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
import { useController, useForm, useWatch } from "react-hook-form";

import { CustomHeadersConfigurationSection } from "@app/components/actions/mcp/create/CustomHeadersConfigurationSection";
import { InternalBearerTokenSection } from "@app/components/actions/mcp/create/InternalBearerTokenSection";
import { RemoteMCPServerConfigurationSection } from "@app/components/actions/mcp/create/RemoteMCPServerConfigurationSection";
import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import { submitCreateMCPServerDialogForm } from "@app/components/actions/mcp/submitCreateMCPServerDialogForm";
import { getCreateMCPServerDialogDefaultValues } from "@app/components/actions/mcp/transformCreateMCPServerDialogForm";
import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/types";
import { createMCPServerDialogFormSchema } from "@app/components/actions/mcp/types";
import { handleCreateMCPServerDialogSubmitError } from "@app/components/actions/mcp/utils";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
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
import { validateUrl } from "@app/types";

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

  const { field: authCredentialsField } = useController({
    control: form.control,
    name: "authCredentials",
  });

  const remoteServerUrl = useWatch({
    control: form.control,
    name: "remoteServerUrl",
  });
  const sharedSecret = useWatch({
    control: form.control,
    name: "sharedSecret",
  });
  const useCase = useWatch({
    control: form.control,
    name: "useCase",
  });
  const oauthFormValid = useWatch({
    control: form.control,
    name: "oauthFormValid",
  });

  const [
    remoteMCPServerOAuthDiscoveryDone,
    setRemoteMCPServerOAuthDiscoveryDone,
  ] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );

  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { createWithURL } = useCreateRemoteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  useEffect(() => {
    if (internalMCPServer && isOpen) {
      setAuthorization(internalMCPServer.authorization);
    } else {
      setAuthorization(null);
    }
  }, [internalMCPServer, isOpen]);

  const resetState = () => {
    setIsLoading(false);
    setExternalIsLoading(false);
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setAuthorization(null);
    form.reset(defaultValues);
  };

  const handleSave = async (values: CreateMCPServerDialogFormValues) => {
    setIsLoading(true);

    const submitRes = await submitCreateMCPServerDialogForm({
      owner,
      internalMCPServer,
      authorization,
      remoteMCPServerOAuthDiscoveryDone,
      values,
      discoverOAuthMetadata,
      createWithURL,
      createInternalMCPServer,
      onBeforeCreateServer: () => setExternalIsLoading(true),
    });

    if (submitRes.isErr()) {
      handleCreateMCPServerDialogSubmitError({
        error: submitRes.error,
        values,
        authorization,
        form,
        sendNotification,
        setRemoteMCPServerOAuthDiscoveryDone,
        setExternalIsLoading,
        setIsLoading,
      });
      return;
    }

    setRemoteMCPServerOAuthDiscoveryDone(
      submitRes.value.remoteMCPServerOAuthDiscoveryDone
    );

    if (submitRes.value.type === "oauth_required") {
      setAuthorization(submitRes.value.authorization);
      authCredentialsField.onChange(submitRes.value.authCredentials);
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

  /* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
  const isSubmitDisabled =
    !oauthFormValid ||
    (authorization && !useCase) ||
    (defaultServerConfig?.authMethod === "bearer" && !sharedSecret) ||
    (internalMCPServer &&
      !authorization &&
      requiresBearerTokenConfiguration(internalMCPServer) &&
      !sharedSecret) ||
    (!internalMCPServer && !validateUrl(remoteServerUrl).valid) ||
    isLoading;
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

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
                    setAuthorization={setAuthorization}
                  />
                )}

              {authorization && (
                <MCPServerOAuthConnexion
                  toolName={toolName}
                  authorization={authorization}
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
              label: isLoading
                ? "Loading..."
                : authorization
                  ? "Setup connection"
                  : "Save",
              variant: "primary",
              disabled: isSubmitDisabled,
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit(handleSave)();
              },
            }}
          />
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
