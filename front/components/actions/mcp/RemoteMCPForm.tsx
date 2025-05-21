import {
  ActionBookOpenIcon,
  ActionIcons,
  Button,
  CloudArrowLeftRightIcon,
  CollapsibleComponent,
  ContentMessage,
  ExclamationCircleIcon,
  IconPicker,
  Input,
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Separator,
  useSendNotification,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import {
  useMCPServers,
  useSyncRemoteMCPServer,
  useUpdateRemoteMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
}

const MCPFormSchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z.string().min(1, "Description is required."),
  icon: z.string({ required_error: "Icon is required." }),
  sharedSecret: z.string().optional(),
});

export type MCPFormType = z.infer<typeof MCPFormSchema>;

export function RemoteMCPForm({ owner, mcpServer }: RemoteMCPFormProps) {
  const sendNotification = useSendNotification();

  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const form = useForm<MCPFormType>({
    resolver: zodResolver(MCPFormSchema),
    defaultValues: {
      name: asDisplayName(mcpServer.name),
      description: mcpServer.description,
      icon: mcpServer.icon,
      sharedSecret: mcpServer.sharedSecret || "",
    },
  });

  const { url, lastError, lastSyncAt } = mcpServer;

  const { mutateMCPServers } = useMCPServers({
    owner,
    disabled: true,
  });

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateRemoteMCPServer(owner, mcpServer.sId);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.sId);

  const onSubmit = useCallback(
    async (values: MCPFormType) => {
      try {
        const result = await updateServer({
          name: values.name,
          description: values.description,
          icon: values.icon,
          sharedSecret: values.sharedSecret,
        });
        if (result.success) {
          void mutateMCPServers();

          sendNotification({
            title: "MCP server updated",
            type: "success",
            description: "The MCP server has been successfully updated.",
          });

          form.reset(values);
        } else {
          throw new Error("Failed to update MCP server");
        }
      } catch (err) {
        sendNotification({
          title: "Error updating MCP server",
          type: "error",
          description: err instanceof Error ? err.message : "An error occurred",
        });
      }
    },
    [updateServer, mutateMCPServers, sendNotification, form]
  );

  const handleSynchronize = useCallback(async () => {
    setIsSynchronizing(true);

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
        description: normalizeError(error ?? "An error occured").message,
      });
    } finally {
      setIsSynchronizing(false);
    }
  }, [syncServer, mutateMCPServers, sendNotification]);

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      {lastError && (
        <ContentMessage
          variant="warning"
          icon={ExclamationCircleIcon}
          size="sm"
          title="Synchronization Error"
        >
          Server could not synchronize successfully. Last attempt{" "}
          {lastSyncAt ? "on " + new Date(lastSyncAt).toLocaleString() : ""} :{" "}
          {lastError}
        </ContentMessage>
      )}

      <div className="heading-lg">Server Settings</div>
      <div className="space-y-2">
        <Label htmlFor="url">Server URL</Label>
        <div className="flex space-x-2">
          <div className="flex-grow">
            <Input
              value={url}
              disabled
              placeholder="https://example.com/api/mcp"
            />
          </div>
          <Button
            label={isSynchronizing ? "Synchronizing..." : "Synchronize"}
            icon={CloudArrowLeftRightIcon}
            variant="outline"
            onClick={handleSynchronize}
            disabled={isSynchronizing}
          />
        </div>
      </div>
      <div className="flex items-end space-x-2">
        <div className="flex-grow">
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <Input
                {...field}
                label="Name"
                isError={!!form.formState.errors.name}
                message={form.formState.errors.name?.message}
                placeholder={mcpServer.cachedName}
              />
            )}
          />
        </div>
        <Controller
          control={form.control}
          name="icon"
          render={({ field }) => {
            const currentIcon = field.value;
            const CurrentIconComponent =
              ActionIcons[currentIcon as keyof typeof ActionIcons] ||
              ActionBookOpenIcon;

            return (
              <PopoverRoot open={isPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={CurrentIconComponent}
                    onClick={() => setIsPopoverOpen(true)}
                    isSelect
                  />
                </PopoverTrigger>
                <PopoverContent
                  className="w-fit py-0"
                  onInteractOutside={closePopover}
                  onEscapeKeyDown={closePopover}
                >
                  <IconPicker
                    icons={ActionIcons}
                    selectedIcon={currentIcon}
                    onIconSelect={(iconName: string) => {
                      field.onChange(iconName);
                      closePopover();
                    }}
                  />
                </PopoverContent>
              </PopoverRoot>
            );
          }}
        />
      </div>

      <div className="space-y-2">
        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <>
              <Input
                {...field}
                label="Description"
                isError={!!form.formState.errors.description?.message}
                message={form.formState.errors.description?.message}
                placeholder={
                  mcpServer.cachedDescription ?? DEFAULT_MCP_ACTION_DESCRIPTION
                }
              />
              <p className="text-xs text-gray-500 dark:text-gray-500-night">
                This is only for internal reference and is not shown to the
                model.
              </p>
            </>
          )}
        />
      </div>

      <CollapsibleComponent
        triggerChildren={<div className="heading-lg">Advanced Settings</div>}
        contentChildren={
          <div className="space-y-2">
            <Controller
              control={form.control}
              name="sharedSecret"
              render={({ field }) => (
                <>
                  <Input
                    {...field}
                    label="Bearer Token (Authorization)"
                    isError={!!form.formState.errors.sharedSecret}
                    message={form.formState.errors.sharedSecret?.message}
                    placeholder="Paste the Bearer Token here"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-500-night">
                    This will be sent alongside the request made to your server
                    as a Bearer token in the headers.
                  </p>
                  {/** NOTE: Once we implemented the OAuth flow for remote servers
                   * we should remove this field if the server is using OAuth.
                   * It's one or the other.
                   */}
                </>
              )}
            />
          </div>
        }
      />

      {form.formState.isDirty && (
        <div className="flex flex-row items-end justify-end gap-2">
          <Button
            variant="outline"
            label={"Cancel"}
            disabled={form.formState.isSubmitting}
            onClick={() => {
              form.reset();
            }}
          />

          <Button
            variant="highlight"
            label={form.formState.isSubmitting ? "Saving..." : "Save"}
            disabled={form.formState.isSubmitting}
            onClick={async (event: Event) => {
              event.preventDefault();
              void form.handleSubmit(onSubmit)();
            }}
          />
        </div>
      )}

      <Separator />
    </div>
  );
}
