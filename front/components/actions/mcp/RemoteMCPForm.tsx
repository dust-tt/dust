import {
  Button,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Label,
  Page,
  Separator,
  TextArea,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import type { RemoteMCPServerType } from "@app/lib/actions/mcp_metadata";
import {
  useMCPServers,
  useSyncRemoteMCPServer,
  useUpdateRemoteMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
}

const MCPFormSchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z.string().min(1, "Description is required."),
});

export type MCPFormType = z.infer<typeof MCPFormSchema>;

export function RemoteMCPForm({ owner, mcpServer }: RemoteMCPFormProps) {
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSecretVisible, setIsSecretVisible] = useState(false);

  const form = useForm<MCPFormType>({
    resolver: zodResolver(MCPFormSchema),
    defaultValues: {
      name: mcpServer.name,
      description: mcpServer.description,
    },
  });

  const { url, sharedSecret } = mcpServer;

  const sendNotification = useSendNotification();
  const [serverState, setServerState] = useState<
    "idle" | "saving" | "synchronizing"
  >("idle");

  const { mutateMCPServers } = useMCPServers({
    owner,
    disabled: true,
  });

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateRemoteMCPServer(owner, mcpServer.id);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.id);

  const onSubmit = async (values: MCPFormType) => {
    setServerState("saving");
    try {
      const result = await updateServer({
        name: values.name,
        url: mcpServer.url || "",
        description: values.description,
        tools: mcpServer.tools,
      });
      if (result.success) {
        void mutateMCPServers();

        sendNotification({
          title: "MCP server updated",
          type: "success",
          description: "The MCP server has been successfully updated.",
        });
      } else {
        throw new Error("Failed to update MCP server");
      }
    } catch (err) {
      sendNotification({
        title: "Error updating MCP server",
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setServerState("idle");
    }
  };

  const handleSynchronize = async () => {
    if (!url) {
      setSyncError("Please enter a valid URL before synchronizing.");
      return;
    }

    setSyncError(null);

    setServerState("synchronizing");
    try {
      const result = await syncServer();

      if (result.success) {
        void mutateMCPServers();

        sendNotification({
          title: "Success",
          type: "success",
          description: "MCP server synchronized successfully.",
        });
      } else {
        throw new Error("Failed to synchronize MCP server");
      }
    } catch (error) {
      console.error("Error synchronizing with MCP:", error);
      sendNotification({
        title: "Error synchronizing MCP server",
        type: "error",
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
      setSyncError(
        error instanceof Error
          ? error.message
          : "Failed to synchronize with MCP server"
      );
    } finally {
      setServerState("idle");
    }
  };

  const toggleSecretVisibility = () => {
    setIsSecretVisible(!isSecretVisible);
  };

  return (
    <div className="space-y-6">
      {syncError && (
        <div className="rounded-md bg-warning-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <XMarkIcon className="h-5 w-5 text-warning-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-warning-800">
                Synchronization Error
              </h3>
              <div className="mt-2 text-sm text-warning-700">
                <p>{syncError}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="url">URL</Label>
        <div className="flex space-x-2">
          <div className="flex-grow">
            <Input
              value={url}
              disabled
              placeholder="https://example.com/api/mcp"
            />
          </div>
          <Button
            label={
              serverState === "synchronizing"
                ? "Synchronizing..."
                : "Synchronize"
            }
            variant="outline"
            onClick={handleSynchronize}
            disabled={serverState === "synchronizing"}
          />
        </div>
      </div>

      <Separator className="my-4" />

      <Page.SectionHeader title="Settings" />
      <div>
        <Label htmlFor="name">Name</Label>
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Input
              {...field}
              isError={!!form.formState.errors.name}
              message={form.formState.errors.name?.message}
            />
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <>
              <TextArea
                error={form.formState.errors.description?.message}
                {...field}
              />
              {form.formState.errors.description && (
                <div className="ml-3.5 flex items-center gap-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {form.formState.errors.description?.message}
                </div>
              )}
            </>
          )}
        />
      </div>

      <div className="flex flex-col items-end gap-2">
        <Button
          label="Save"
          disabled={!form.formState.isDirty || form.formState.isSubmitting}
          onClick={async (event: Event) => {
            event.preventDefault();
            void form.handleSubmit(onSubmit)();
          }}
        />
      </div>

      <Separator className="my-4" />

      {sharedSecret && (
        <>
          <div className="space-y-2">
            <Label htmlFor="sharedSecret">Shared Secret</Label>
            <div className="relative">
              <Input
                value={sharedSecret}
                readOnly
                type={isSecretVisible ? "text" : "password"}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-1">
                <Button
                  icon={isSecretVisible ? EyeSlashIcon : EyeIcon}
                  variant="tertiary"
                  size="xs"
                  onClick={toggleSecretVisibility}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              This is the secret key used to authenticate your MCP server with
              Dust. Keep it secure.
            </p>
          </div>
          <Separator className="my-4" />
        </>
      )}
    </div>
  );
}
