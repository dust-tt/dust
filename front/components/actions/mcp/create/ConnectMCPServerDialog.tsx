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

import { submitConnectMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitConnectMCPServerDialogForm";
import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import { mcpServerOAuthFormSchema } from "@app/components/actions/mcp/forms/types";
import { getConnectMCPServerDialogDefaultValues } from "@app/components/actions/mcp/forms/utils";
import {
  AUTH_CREDENTIALS_ERROR_KEY,
  MCPServerOAuthConnexion,
} from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerDisplayName,
  getServerTypeAndIdFromSId,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useCreateMCPServerConnection,
  useDiscoverOAuthMetadata,
  useUpdateMCPServerView,
} from "@app/lib/swr/mcp_servers";
import { OAUTH_PROVIDER_NAMES } from "@app/types/oauth/lib";
import type { WorkspaceType } from "@app/types/user";

interface ConnectMCPServerDialogProps {
  owner: WorkspaceType;
  mcpServerView: MCPServerViewType;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function ConnectMCPServerDialog({
  owner,
  mcpServerView,
  setIsLoading: setExternalIsLoading,
  isOpen = false,
  setIsOpen,
}: ConnectMCPServerDialogProps) {
  const sendNotification = useSendNotification();

  const defaultValues = getConnectMCPServerDialogDefaultValues();
  const form = useForm<MCPServerOAuthFormValues>({
    resolver: zodResolver(mcpServerOAuthFormSchema),
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
  const [
    remoteMCPServerOAuthDiscoveryDone,
    setRemoteMCPServerOAuthDiscoveryDone,
  ] = useState(false);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });
  const { discoverOAuthMetadata } = useDiscoverOAuthMetadata(owner);
  const { updateServerView } = useUpdateMCPServerView(owner, mcpServerView);

  const serverType = useMemo(
    () => getServerTypeAndIdFromSId(mcpServerView.server.sId).serverType,
    [mcpServerView]
  );

  const toolName = useMemo(() => {
    if (mcpServerView.server) {
      return getMcpServerDisplayName(mcpServerView.server);
    }
    return "MCP Server";
  }, [mcpServerView]);

  const toolIcon: InternalAllowedIconType | CustomResourceIconType =
    useMemo(() => {
      if (mcpServerView.server) {
        return mcpServerView.server.icon;
      }
      return DEFAULT_MCP_SERVER_ICON;
    }, [mcpServerView]);

  // Discover OAuth metadata for remote MCP servers.
  useEffect(() => {
    const discoverOAuth = async () => {
      if (isOpen && mcpServerView) {
        if (serverType === "internal") {
          setAuthorization(mcpServerView.server.authorization);
        } else if (
          isRemoteMCPServerType(mcpServerView.server) &&
          mcpServerView.server.url &&
          !remoteMCPServerOAuthDiscoveryDone
        ) {
          setIsLoading(true);
          const discoverOAuthMetadataRes = await discoverOAuthMetadata(
            mcpServerView.server.url,
            mcpServerView.server.customHeaders
              ? Object.entries(mcpServerView.server.customHeaders).map(
                  ([key, value]) => ({ key, value: String(value) })
                )
              : undefined
          );

          if (
            discoverOAuthMetadataRes.isOk() &&
            discoverOAuthMetadataRes.value.oauthRequired
          ) {
            setAuthorization({
              provider: "mcp",
              supported_use_cases: ["platform_actions", "personal_actions"],
            });
            form.setValue("authCredentials", {
              ...discoverOAuthMetadataRes.value.connectionMetadata,
            });
            setRemoteMCPServerOAuthDiscoveryDone(true);
          } else if (discoverOAuthMetadataRes.isErr()) {
            sendNotification({
              type: "error",
              title: "Failed to discover OAuth metadata for MCP server",
              description: `${discoverOAuthMetadataRes.error.message} (${mcpServerView.server.url})`,
            });
          }
        }
        setIsLoading(false);
      } else {
        setAuthorization(null);
      }
    };

    void discoverOAuth();
  }, [
    mcpServerView,
    isOpen,
    serverType,
    remoteMCPServerOAuthDiscoveryDone,
    discoverOAuthMetadata,
    form,
    sendNotification,
  ]);

  const resetState = () => {
    setExternalIsLoading(false);
    form.reset(defaultValues);
    setIsLoading(false);
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setAuthorization(null);
  };

  const handleSave = async (values: MCPServerOAuthFormValues) => {
    if (!authorization) {
      return;
    }

    setIsLoading(true);
    const submitRes = await submitConnectMCPServerDialogForm({
      owner,
      mcpServerView,
      authorization,
      values,
      createMCPServerConnection,
      updateServerView,
      onBeforeAssociateConnection: () => setExternalIsLoading(true),
    });

    if (submitRes.isErr()) {
      sendNotification({
        type: "error",
        title: `Failed to connect ${OAUTH_PROVIDER_NAMES[authorization.provider]}`,
        description: submitRes.error.message,
      });
      setIsLoading(false);
      return;
    }

    setExternalIsLoading(false);
    setIsLoading(false);
    setIsOpen(false);
    resetState();
  };

  // Form is valid when: use case selected AND no credential validation errors.
  const isFormValid = !!useCase && !hasCredentialErrors;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        resetState();
      }}
    >
      <DialogContent size="lg">
        <FormProvider form={form} asForm={false}>
          <DialogHeader>
            <DialogTitle visual={getAvatarFromIcon(toolIcon, "sm")}>
              Connect {toolName}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {authorization && (
              <MCPServerOAuthConnexion
                toolName={toolName}
                authorization={authorization}
                documentationUrl={
                  mcpServerView.server?.documentationUrl ?? undefined
                }
              />
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "ghost",
              onClick: resetState,
            }}
            rightButtonProps={
              authorization
                ? {
                    isLoading: isLoading,
                    label: "Setup connection",
                    variant: "primary",
                    onClick: (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // handleSubmit gates on form validity (including errors set via setError).
                      void form.handleSubmit(handleSave)();
                    },
                    disabled: !isFormValid || isLoading,
                  }
                : undefined
            }
          />
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
