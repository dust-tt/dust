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
import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import { useSyncRemoteMCPServer } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
}

export function RemoteMCPForm({ owner, mcpServer }: RemoteMCPFormProps) {
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const form = useFormContext<InfoFormValues>();
  const currentIcon = form.watch("icon");

  const { url, lastError, lastSyncAt } = mcpServer;

  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.sId);

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
          {(() => {
            const IconComponent =
              (currentIcon &&
                (ActionIcons[
                  currentIcon as keyof typeof ActionIcons
                ] as any)) ||
              ActionBookOpenIcon;
            return (
              <PopoverRoot open={isPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={IconComponent}
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
                      form.setValue("icon", iconName, { shouldDirty: true });
                      closePopover();
                    }}
                  />
                </PopoverContent>
              </PopoverRoot>
            );
          })()}
        </div>
      </div>

      {!mcpServer.authorization && (
        <CollapsibleComponent
          triggerChildren={<div className="heading-lg">Advanced Settings</div>}
          contentChildren={
            <div className="space-y-2">
              <Input
                {...form.register("sharedSecret")}
                label="Bearer Token (Authorization)"
                isError={!!form.formState.errors.sharedSecret}
                message={form.formState.errors.sharedSecret?.message}
                placeholder="Paste the Bearer Token here"
              />
              <p className="text-xs text-gray-500 dark:text-gray-500-night">
                This will be sent alongside the request made to your server as a
                Bearer token in the headers.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
}
