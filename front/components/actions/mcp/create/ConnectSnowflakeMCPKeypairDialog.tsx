import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { clientFetch } from "@app/lib/egress/client";
import {
  useCreateMCPServerConnection,
  useUpdateMCPServerView,
} from "@app/lib/swr/mcp_servers";
import type { PostCredentialsResponseBody } from "@app/pages/api/w/[wId]/credentials";
import type { WithAPIErrorResponse, WorkspaceType } from "@app/types";
import { isAPIErrorResponse } from "@app/types/error";

const snowflakeMCPKeypairFormSchema = z.object({
  account: z.string().min(1, "Account is required."),
  username: z.string().min(1, "Username is required."),
  role: z.string().min(1, "Role is required."),
  warehouse: z.string().min(1, "Warehouse is required."),
  privateKey: z.string().min(1, "Private key is required."),
  privateKeyPassphrase: z.string().optional(),
});

type SnowflakeMCPKeypairFormValues = z.infer<
  typeof snowflakeMCPKeypairFormSchema
>;

interface ConnectSnowflakeMCPKeypairDialogProps {
  owner: WorkspaceType;
  mcpServerView: MCPServerViewType;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function ConnectSnowflakeMCPKeypairDialog({
  owner,
  mcpServerView,
  setIsLoading: setExternalIsLoading,
  isOpen = false,
  setIsOpen,
}: ConnectSnowflakeMCPKeypairDialogProps) {
  const sendNotification = useSendNotification();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SnowflakeMCPKeypairFormValues>({
    resolver: zodResolver(snowflakeMCPKeypairFormSchema),
    defaultValues: {
      account: "",
      username: "",
      role: "",
      warehouse: "",
      privateKey: "",
      privateKeyPassphrase: undefined,
    },
    mode: "onChange",
  });

  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "workspace",
  });
  const { updateServerView } = useUpdateMCPServerView(owner, mcpServerView);

  const resetState = () => {
    setExternalIsLoading(false);
    form.reset();
    setIsLoading(false);
  };

  const handleSave = async (values: SnowflakeMCPKeypairFormValues) => {
    setIsLoading(true);

    const response = await clientFetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "snowflake",
        credentials: {
          auth_type: "keypair",
          username: values.username,
          account: values.account,
          role: values.role,
          warehouse: values.warehouse,
          private_key: values.privateKey,
          private_key_passphrase: values.privateKeyPassphrase,
        },
      }),
    });

    const result: WithAPIErrorResponse<PostCredentialsResponseBody> =
      await response.json();

    if (!response.ok || isAPIErrorResponse(result)) {
      sendNotification({
        type: "error",
        title: "Failed to save Snowflake credentials",
        description: isAPIErrorResponse(result)
          ? result.error.message
          : "An error occurred.",
      });
      setIsLoading(false);
      return;
    }

    const credentialId = result.credentials.id;

    setExternalIsLoading(true);
    const connectionCreationRes = await createMCPServerConnection({
      credentialId,
      mcpServerId: mcpServerView.server.sId,
      mcpServerDisplayName: getMcpServerDisplayName(mcpServerView.server),
      provider: "snowflake",
    });
    if (!connectionCreationRes) {
      setExternalIsLoading(false);
      setIsLoading(false);
      return;
    }

    const updateServerViewRes = await updateServerView({
      oAuthUseCase: "platform_actions",
    });
    if (!updateServerViewRes) {
      setExternalIsLoading(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    setIsOpen(false);
    resetState();
  };

  const canSubmit = form.formState.isValid;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          resetState();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Connect Snowflake (Key-pair)</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <FormProvider form={form}>
            <div className="space-y-5 text-foreground dark:text-foreground-night">
              <Input
                {...form.register("account")}
                label="Account"
                placeholder="abc123.us-east-1"
                isError={!!form.formState.errors.account}
                message={form.formState.errors.account?.message}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  {...form.register("username")}
                  label="Username"
                  isError={!!form.formState.errors.username}
                  message={form.formState.errors.username?.message}
                />
                <Input
                  {...form.register("role")}
                  label="Role"
                  isError={!!form.formState.errors.role}
                  message={form.formState.errors.role?.message}
                />
              </div>
              <Input
                {...form.register("warehouse")}
                label="Warehouse"
                isError={!!form.formState.errors.warehouse}
                message={form.formState.errors.warehouse?.message}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Private key (PEM format)
                </label>
                <TextArea
                  {...form.register("privateKey")}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                  rows={8}
                />
                {form.formState.errors.privateKey?.message && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {form.formState.errors.privateKey.message}
                  </p>
                )}
              </div>
              <Input
                {...form.register("privateKeyPassphrase")}
                label="Private key passphrase (optional)"
                type="password"
              />
            </div>
          </FormProvider>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => setIsOpen(false),
          }}
          rightButtonProps={{
            label: "Connect",
            variant: "primary",
            onClick: form.handleSubmit(handleSave),
            disabled: !canSubmit,
            isLoading,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
