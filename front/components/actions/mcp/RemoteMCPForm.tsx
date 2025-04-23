import {
  ActionBookOpenIcon,
  ActionIcons,
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  CloudArrowLeftRightIcon,
  ContentMessage,
  ExclamationCircleIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeSlashIcon,
  IconPicker,
  Input,
  Label,
  LinkWrapper,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Separator,
  useCopyToClipboard,
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
import { formatSecret } from "@app/lib/utils";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
}

const MCPFormSchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z.string().min(1, "Description is required."),
  icon: z.string({ required_error: "Icon is required." }),
});

export type MCPFormType = z.infer<typeof MCPFormSchema>;

export function RemoteMCPForm({ owner, mcpServer }: RemoteMCPFormProps) {
  const sendNotification = useSendNotification();

  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [isCopied, copy] = useCopyToClipboard();

  const form = useForm<MCPFormType>({
    resolver: zodResolver(MCPFormSchema),
    defaultValues: {
      name: asDisplayName(mcpServer.name),
      description: mcpServer.description,
      icon: mcpServer.icon,
    },
  });

  const { url, sharedSecret } = mcpServer;

  const { mutateMCPServers } = useMCPServers({
    owner,
    disabled: true,
  });

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateRemoteMCPServer(owner, mcpServer.id);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.id);

  const onSubmit = useCallback(
    async (values: MCPFormType) => {
      try {
        const result = await updateServer({
          name: values.name,
          description: values.description,
          icon: values.icon,
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
    if (!url) {
      setSyncError("Please enter a valid URL before synchronizing.");
      return;
    }

    setSyncError(null);
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
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
      setSyncError(
        error instanceof Error
          ? error.message
          : "Failed to synchronize with MCP server"
      );
    } finally {
      setIsSynchronizing(false);
    }
  }, [url, syncServer, mutateMCPServers, sendNotification]);

  const toggleSecretVisibility = () => {
    setIsSecretVisible(!isSecretVisible);
  };

  const copyToClipboard = async () => {
    if (sharedSecret) {
      await copy(sharedSecret);
      sendNotification({
        title: "Copied to clipboard",
        type: "success",
        description: "The shared secret has been copied to your clipboard.",
      });
    }
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  return (
    <div className="space-y-5 text-foreground">
      {syncError && (
        <ContentMessage
          variant="warning"
          icon={ExclamationCircleIcon}
          size="sm"
          title="Synchronization Error"
        >
          {syncError}
        </ContentMessage>
        // <div className="rounded-md bg-warning-50 p-4">
        //   <div className="flex">
        //     <div className="flex-shrink-0">
        //       <Icon size="sm" icon={XMarkIcon} className="text-warning" />
        //     </div>
        //     <div className="ml-3">
        //       <h3 className="text-sm font-medium text-warning-800">
        //         Synchronization Error
        //       </h3>
        //       <div className="mt-2 text-sm text-warning-700">
        //         <p>{syncError}</p>
        //       </div>
        //     </div>
        //   </div>
        // </div>
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
              <p className="text-xs text-gray-500">
                This is only for internal reference and is not shown to the
                model.
              </p>
            </>
          )}
        />
      </div>
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

      <div className="heading-lg">Advanced</div>
      <p>
          For more details on the advanced settings, please refer to the Dust{" "}
          <LinkWrapper href="https://docs.dust.tt/docs/remote-mcp-server"
            target="_blank"
            rel="noopener noreferrer"
          >
            documentation <ExternalLinkIcon className="inline" />
          </LinkWrapper>
          .
        </p>
      <div className="space-y-2">
       {sharedSecret && (
        <>
          <div className="space-y-2">
            <Label htmlFor="sharedSecret">Shared Secret</Label>
            <div className="flex items-center justify-between">
              <p className="overflow-hidden text-ellipsis whitespace-nowrap">
                {isSecretVisible ? sharedSecret : formatSecret(sharedSecret)}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  icon={isSecretVisible ? EyeSlashIcon : EyeIcon}
                  variant="outline"
                  size="sm"
                  onClick={toggleSecretVisibility}
                  tooltip={isSecretVisible ? "Hide secret" : "Show secret"}
                />
                <Button
                  icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              This is the secret key used to authenticate your MCP server with
              Dust. Keep it secure.
            </p>
          </div>
          <Separator />
        </>
      )}
      </div>
    </div>
  );
}
