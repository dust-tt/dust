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
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import { isDefaultRemoteMcpServerURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import {
  useSyncRemoteMCPServer,
  useUpdateMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

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
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Check if this is a default server (should be read-only for name/description)
  const isDefaultServer = isDefaultRemoteMcpServerURL(mcpServer.url);

  const form = useForm<MCPFormType>({
    resolver: zodResolver(MCPFormSchema),
    defaultValues: {
      name: mcpServer.name || mcpServer.cachedName,
      description:
        (mcpServer.description || mcpServer.cachedDescription) ?? undefined,
      icon: mcpServer.icon,
      sharedSecret: mcpServer.sharedSecret || "",
    },
  });

  const { url, lastError, lastSyncAt } = mcpServer;

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateMCPServer(owner, mcpServer.sId);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.sId);

  const onSubmit = useCallback(
    async (values: MCPFormType) => {
      const updated = await updateServer({
        name: values.name,
        description: values.description,
        icon: values.icon,
        sharedSecret: values.sharedSecret,
      });
      if (updated) {
        form.reset(values);
      }
    },
    [updateServer, form]
  );

  const handleSynchronize = useCallback(async () => {
    setIsSynchronizing(true);
    await syncServer();
    setIsSynchronizing(false);
  }, [syncServer]);

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
            label={isSynchronizing ? "Syncing..." : "Sync"}
            isLoading={isSynchronizing}
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
                disabled={isDefaultServer}
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
                    disabled={isDefaultServer}
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
                disabled={isDefaultServer}
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

      {!mcpServer.authorization && (
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
                      This will be sent alongside the request made to your
                      server as a Bearer token in the headers.
                    </p>
                  </>
                )}
              />
            </div>
          }
        />
      )}

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
    </div>
  );
}
