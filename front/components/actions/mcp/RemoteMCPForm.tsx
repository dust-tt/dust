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

import type { MCPServerViewType, RemoteMCPServerType } from "@app/lib/api/mcp";
import {
  useSyncRemoteMCPServer,
  useUpdateMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  mcpServer: RemoteMCPServerType;
}

const MCPFormSchema = z.object({
  icon: z.string({ required_error: "Icon is required." }),
  sharedSecret: z.string().optional(),
});

export type MCPFormType = z.infer<typeof MCPFormSchema>;

export function RemoteMCPForm({
  owner,
  mcpServerView,
  mcpServer,
}: RemoteMCPFormProps) {
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const form = useForm<MCPFormType>({
    resolver: zodResolver(MCPFormSchema),
    defaultValues: {
      icon: mcpServer.icon,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      sharedSecret: mcpServer.sharedSecret || "",
    },
  });

  const { url, lastError, lastSyncAt } = mcpServer;

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateMCPServer(owner, mcpServerView);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.sId);

  const onSubmit = useCallback(
    async (values: MCPFormType) => {
      if (values.sharedSecret) {
        const updated = await updateServer({
          sharedSecret: values.sharedSecret,
        });
        if (updated) {
          form.reset(values);
        }
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
        <Label htmlFor="url">Server URL & Icon</Label>
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
                        // Immediate update of the icon in the form and save it.
                        form.setValue("icon", iconName);
                        void form.handleSubmit(onSubmit)();
                        closePopover();
                      }}
                    />
                  </PopoverContent>
                </PopoverRoot>
              );
            }}
          />
        </div>
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
