import { getStaticCredentialForm } from "@app/components/actions/mcp/create/static_credential_forms";
import { submitConnectMCPServerDialogForm } from "@app/components/actions/mcp/forms/submitConnectMCPServerDialogForm";
import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import { mcpServerOAuthFormSchema } from "@app/components/actions/mcp/forms/types";
import { getConnectMCPServerDialogDefaultValues } from "@app/components/actions/mcp/forms/utils";
import type {
  StaticCredentialConfig,
  StaticCredentialFormHandle,
} from "@app/components/actions/mcp/MCPServerAuthConnection";
import { MCPServerAuthConnection } from "@app/components/actions/mcp/MCPServerAuthConnection";
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
import { useRegionContext } from "@app/lib/auth/RegionContext";
import {
  useCreateMCPServerConnection,
  useDiscoverOAuthMetadata,
  useUpdateMCPServerView,
} from "@app/lib/swr/mcp_servers";
import datadogLogger from "@app/logger/datadogLogger";
import {
  OAUTH_PROVIDER_NAMES,
  validateOAuthCredentials,
} from "@app/types/oauth/lib";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

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
  const regionContext = useRegionContext();

  const defaultValues = getConnectMCPServerDialogDefaultValues();
  const form = useForm<MCPServerOAuthFormValues>({
    resolver: zodResolver(mcpServerOAuthFormSchema),
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
          // For static OAuth servers, skip discovery entirely — their credentials
          // are manually provided by the admin and there is no .well-known endpoint.
          if (mcpServerView.server.authorization?.provider === "mcp_static") {
            setAuthorization(mcpServerView.server.authorization);
            setRemoteMCPServerOAuthDiscoveryDone(true);
            setIsLoading(false);
            return;
          }
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
    setIsStaticFormValid(false);
    setRemoteMCPServerOAuthDiscoveryDone(false);
    setAuthorization(null);
  };

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

  const handleOAuthSave = async (values: MCPServerOAuthFormValues) => {
    if (!authorization) {
      return;
    }

    // Guard: handleSubmit only checks Zod schema errors, not manual setError errors.
    if (credentialError) {
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
      regionInfo: regionContext.regionInfo,
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

  // Form is valid when: use case selected AND either OAuth or static form is valid.
  const isFormValid =
    !!useCase && (hasStaticForm ? isStaticFormValid : !credentialError);

  const handleStaticCredentialSave = async () => {
    if (!authorization || !useCase) {
      return;
    }

    setIsLoading(true);
    setExternalIsLoading(true);

    try {
      const formHandle = staticFormRef.current;
      if (!formHandle) {
        sendNotification({
          type: "error",
          title: "Cannot submit credentials",
          description: "The credentials form is not ready. Please retry.",
        });
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            mcpServerId: mcpServerView.server.sId,
            hasAuthorization: !!authorization,
            useCase,
          },
          "Static credential form ref is null at submit time"
        );
        return;
      }

      const credentialId = await formHandle.submit();
      if (!credentialId) {
        // The form surfaced its own notification for the specific failure;
        // log here so we also have a parent-side breadcrumb.
        datadogLogger.warn(
          {
            workspaceId: owner.sId,
            mcpServerId: mcpServerView.server.sId,
          },
          "Static credential form submit returned null"
        );
        return;
      }

      const connectionCreationRes = await createMCPServerConnection({
        credentialId,
        mcpServerId: mcpServerView.server.sId,
        mcpServerDisplayName: getMcpServerDisplayName(mcpServerView.server),
        provider: authorization.provider,
      });
      if (!connectionCreationRes) {
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            mcpServerId: mcpServerView.server.sId,
            credentialId,
          },
          "createMCPServerConnection returned falsy result"
        );
        return;
      }

      const updateServerViewRes = await updateServerView({
        oAuthUseCase: useCase,
      });
      if (!updateServerViewRes) {
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            mcpServerId: mcpServerView.server.sId,
          },
          "updateServerView returned falsy result"
        );
        return;
      }

      setIsOpen(false);
      resetState();
    } catch (err) {
      const e = normalizeError(err);
      sendNotification({
        type: "error",
        title: "Failed to connect the tool",
        description: e.message,
      });
      datadogLogger.error(
        { workspaceId: owner.sId, err: e },
        "Unexpected error in handleStaticCredentialSave"
      );
    } finally {
      setIsLoading(false);
      setExternalIsLoading(false);
    }
  };

  const handleRightButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasStaticForm) {
      void handleStaticCredentialSave();
    } else {
      void form.handleSubmit(handleOAuthSave)();
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
        <FormProvider form={form} asForm={false}>
          <DialogHeader>
            <DialogTitle visual={getAvatarFromIcon(toolIcon, "sm")}>
              Connect {toolName}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto px-5 py-4">
            {authorization && (
              <MCPServerAuthConnection
                toolName={toolName}
                authorization={authorization}
                documentationUrl={
                  mcpServerView.server?.documentationUrl ?? undefined
                }
                staticCredentialConfig={staticCredentialConfig}
              />
            )}
          </div>
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
                    label: hasStaticForm ? "Connect" : "Setup connection",
                    variant: "primary",
                    onClick: handleRightButtonClick,
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
