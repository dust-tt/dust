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
  Input,
  Label,
  TextArea,
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
  UseCaseCard,
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
import { clientFetch } from "@app/lib/egress/client";
import {
  useCreateMCPServerConnection,
  useDiscoverOAuthMetadata,
  useUpdateMCPServerView,
} from "@app/lib/swr/mcp_servers";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { MCPOAuthUseCase, WorkspaceType } from "@app/types";
import { OAUTH_PROVIDER_NAMES } from "@app/types";

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

  type SnowflakeKeypairFormData = {
    account: string;
    username: string;
    role: string;
    warehouse: string;
    privateKey: string;
  };

  const [snowflakeAuthMethod, setSnowflakeAuthMethod] = useState<
    "oauth" | "keypair"
  >("oauth");
  const [snowflakeKeypairAccount, setSnowflakeKeypairAccount] = useState("");
  const [snowflakeKeypairUsername, setSnowflakeKeypairUsername] = useState("");
  const [snowflakeKeypairRole, setSnowflakeKeypairRole] = useState("");
  const [snowflakeKeypairWarehouse, setSnowflakeKeypairWarehouse] =
    useState("");
  const [snowflakeKeypairPrivateKey, setSnowflakeKeypairPrivateKey] =
    useState("");
  const [snowflakeKeypairPassphrase, setSnowflakeKeypairPassphrase] =
    useState("");
  const [
    snowflakeKeypairSubmitAttempted,
    setSnowflakeKeypairSubmitAttempted,
  ] = useState(false);

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
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

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
    setSnowflakeAuthMethod("oauth");
    setSnowflakeKeypairAccount("");
    setSnowflakeKeypairUsername("");
    setSnowflakeKeypairRole("");
    setSnowflakeKeypairWarehouse("");
    setSnowflakeKeypairPrivateKey("");
    setSnowflakeKeypairPassphrase("");
    setSnowflakeKeypairSubmitAttempted(false);
  };

  const isSnowflake = authorization?.provider === "snowflake";
  const snowflakeSupportsKeypair =
    isSnowflake && authorization?.supported_auth_methods?.includes("keypair");
  const supportsPersonalActions =
    authorization?.supported_use_cases.includes("personal_actions") ?? false;
  const supportsPlatformActions =
    authorization?.supported_use_cases.includes("platform_actions") ?? false;

  useEffect(() => {
    if (!isSnowflake || !snowflakeSupportsKeypair) {
      return;
    }
    if (useCase !== "platform_actions" && snowflakeAuthMethod === "keypair") {
      setSnowflakeAuthMethod("oauth");
      setSnowflakeKeypairSubmitAttempted(false);
    }
  }, [isSnowflake, snowflakeAuthMethod, snowflakeSupportsKeypair, useCase]);

  const keypairValidation = useMemo(() => {
    const errors: Partial<Record<keyof SnowflakeKeypairFormData, string>> = {};

    if (!snowflakeKeypairAccount.trim()) {
      errors.account = "Snowflake account is required.";
    }
    if (!snowflakeKeypairUsername.trim()) {
      errors.username = "Username is required.";
    }
    if (!snowflakeKeypairRole.trim()) {
      errors.role = "Role is required.";
    }
    if (!snowflakeKeypairWarehouse.trim()) {
      errors.warehouse = "Warehouse is required.";
    }

    const key = snowflakeKeypairPrivateKey.trim();
    if (!key) {
      errors.privateKey = "Private key is required.";
    } else if (/-----BEGIN PUBLIC KEY-----/.test(key)) {
      errors.privateKey =
        "This looks like a public key. Please paste the private key PEM.";
    } else if (
      !/-----BEGIN (ENCRYPTED )?PRIVATE KEY-----/.test(key) &&
      !/-----BEGIN RSA PRIVATE KEY-----/.test(key)
    ) {
      errors.privateKey =
        "Unsupported key format. Paste a PEM private key (PKCS#8 or RSA).";
    }

    return { isValid: Object.keys(errors).length === 0, errors };
  }, [
    snowflakeKeypairAccount,
    snowflakeKeypairPrivateKey,
    snowflakeKeypairRole,
    snowflakeKeypairUsername,
    snowflakeKeypairWarehouse,
  ]);

  const handleSave = async (values: MCPServerOAuthFormValues) => {
    if (!authorization) {
      return;
    }

    if (
      isSnowflake &&
      snowflakeSupportsKeypair &&
      useCase === "platform_actions" &&
      snowflakeAuthMethod === "keypair"
    ) {
      setSnowflakeKeypairSubmitAttempted(true);
      if (!keypairValidation.isValid) {
        sendNotification({
          type: "error",
          title: "Invalid Snowflake key-pair configuration",
          description: "Please fix the highlighted fields and try again.",
        });
        return;
      }

      setIsLoading(true);
      const passphrase =
        snowflakeKeypairPassphrase.trim() === ""
          ? undefined
          : snowflakeKeypairPassphrase;

      try {
        const credRes = await clientFetch(`/api/w/${owner.sId}/credentials`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: "snowflake",
            credentials: {
              auth_type: "keypair",
              account: snowflakeKeypairAccount.trim(),
              username: snowflakeKeypairUsername.trim(),
              role: snowflakeKeypairRole.trim(),
              warehouse: snowflakeKeypairWarehouse.trim(),
              private_key: snowflakeKeypairPrivateKey.trim(),
              private_key_passphrase: passphrase,
            },
          }),
        });

        if (!credRes.ok) {
          const data = (await credRes
            .json()
            .catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(
            data?.error?.message ??
              "Failed to store Snowflake credentials. Please try again."
          );
        }

        const data = (await credRes.json()) as { credentials: { id: string } };
        const credentialId = data.credentials.id;
        if (!credentialId) {
          throw new Error(
            "Failed to store Snowflake credentials. Please try again."
          );
        }

        setExternalIsLoading(true);

        const connectionRes = await createMCPServerConnection({
          credentialId,
          mcpServerId: mcpServerView.server.sId,
          mcpServerDisplayName: getMcpServerDisplayName(mcpServerView.server),
          provider: authorization.provider,
        });
        if (!connectionRes) {
          throw new Error("Failed to create MCP server connection.");
        }

        await updateServerView({
          oAuthUseCase: "platform_actions",
        });

        setExternalIsLoading(false);
        setIsLoading(false);
        setIsOpen(false);
        resetState();
        return;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to connect Snowflake",
          description: e instanceof Error ? e.message : "Unknown error.",
        });
        setExternalIsLoading(false);
        setIsLoading(false);
        return;
      }
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
      hasGoogleDriveWriteFeature: hasFeature("google_drive_write_enabled"),
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

  // Form is valid when: use case selected AND (OAuth creds valid or keypair form valid).
  const isFormValid =
    useCase !== null
      ? isSnowflake &&
        snowflakeSupportsKeypair &&
        useCase === "platform_actions" &&
        snowflakeAuthMethod === "keypair"
        ? keypairValidation.isValid
        : !hasCredentialErrors
      : false;

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
            {authorization &&
              isSnowflake &&
              snowflakeSupportsKeypair &&
              (supportsPersonalActions || supportsPlatformActions) && (
                <div className="w-full space-y-4">
                  <div className="heading-lg text-foreground dark:text-foreground-night">
                    Connection type
                  </div>
                  <div className="grid w-full grid-cols-2 gap-4">
                    <UseCaseCard
                      useCaseType="personal_actions"
                      isSelected={useCase === "personal_actions"}
                      isSupported={supportsPersonalActions}
                      toolName={toolName}
                      onSelect={(selectedUseCase: MCPOAuthUseCase) => {
                        form.setValue("useCase", selectedUseCase);
                      }}
                    />
                    <UseCaseCard
                      useCaseType="platform_actions"
                      isSelected={useCase === "platform_actions"}
                      isSupported={supportsPlatformActions}
                      toolName={toolName}
                      onSelect={(selectedUseCase: MCPOAuthUseCase) => {
                        form.setValue("useCase", selectedUseCase);
                      }}
                    />
                  </div>

                  {useCase === "platform_actions" && (
                    <div className="space-y-2">
                      <Label>Authentication method</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            isSelect
                            label={
                              snowflakeAuthMethod === "oauth"
                                ? "OAuth"
                                : "Key-pair (RSA)"
                            }
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuRadioGroup value={snowflakeAuthMethod}>
                            <DropdownMenuRadioItem
                              value="oauth"
                              label="OAuth"
                              onClick={() => {
                                setSnowflakeAuthMethod("oauth");
                                setSnowflakeKeypairSubmitAttempted(false);
                              }}
                            />
                            <DropdownMenuRadioItem
                              value="keypair"
                              label="Key-pair (RSA)"
                              onClick={() => {
                                setSnowflakeAuthMethod("keypair");
                                form.clearErrors(AUTH_CREDENTIALS_ERROR_KEY);
                              }}
                            />
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}

                  {useCase === "platform_actions" &&
                  snowflakeAuthMethod === "keypair" ? (
                    <div className="w-full space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>Snowflake Account</Label>
                        <Input
                          value={snowflakeKeypairAccount}
                          onChange={(e) =>
                            setSnowflakeKeypairAccount(e.target.value)
                          }
                          isError={
                            snowflakeKeypairSubmitAttempted &&
                            !!keypairValidation.errors.account
                          }
                          message={
                            snowflakeKeypairSubmitAttempted
                              ? keypairValidation.errors.account
                              : undefined
                          }
                          messageStatus="error"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Username</Label>
                        <Input
                          value={snowflakeKeypairUsername}
                          onChange={(e) =>
                            setSnowflakeKeypairUsername(e.target.value)
                          }
                          isError={
                            snowflakeKeypairSubmitAttempted &&
                            !!keypairValidation.errors.username
                          }
                          message={
                            snowflakeKeypairSubmitAttempted
                              ? keypairValidation.errors.username
                              : undefined
                          }
                          messageStatus="error"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Input
                          value={snowflakeKeypairRole}
                          onChange={(e) =>
                            setSnowflakeKeypairRole(e.target.value)
                          }
                          isError={
                            snowflakeKeypairSubmitAttempted &&
                            !!keypairValidation.errors.role
                          }
                          message={
                            snowflakeKeypairSubmitAttempted
                              ? keypairValidation.errors.role
                              : undefined
                          }
                          messageStatus="error"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Warehouse</Label>
                        <Input
                          value={snowflakeKeypairWarehouse}
                          onChange={(e) =>
                            setSnowflakeKeypairWarehouse(e.target.value)
                          }
                          isError={
                            snowflakeKeypairSubmitAttempted &&
                            !!keypairValidation.errors.warehouse
                          }
                          message={
                            snowflakeKeypairSubmitAttempted
                              ? keypairValidation.errors.warehouse
                              : undefined
                          }
                          messageStatus="error"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Private Key (PEM)</Label>
                        <TextArea
                          rows={6}
                          value={snowflakeKeypairPrivateKey}
                          onChange={(e) =>
                            setSnowflakeKeypairPrivateKey(e.target.value)
                          }
                        />
                        {snowflakeKeypairSubmitAttempted &&
                          keypairValidation.errors.privateKey && (
                            <div className="text-sm text-warning-600">
                              {keypairValidation.errors.privateKey}
                            </div>
                          )}
                      </div>
                      <div className="space-y-2">
                        <Label>Passphrase (optional)</Label>
                        <Input
                          value={snowflakeKeypairPassphrase}
                          onChange={(e) =>
                            setSnowflakeKeypairPassphrase(e.target.value)
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <MCPServerOAuthConnexion
                      toolName={toolName}
                      authorization={authorization}
                      documentationUrl={
                        mcpServerView.server?.documentationUrl ?? undefined
                      }
                      hideUseCaseSelection
                    />
                  )}
                </div>
              )}

            {authorization &&
              !(isSnowflake && snowflakeSupportsKeypair) && (
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
