import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { MCPServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";
import { MCPServerMetaFields } from "@app/components/actions/mcp/MCPServerMetaFields";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import { useSyncRemoteMCPServer } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionBookOpenIcon,
  ActionIcons,
  AlertCircleV2,
  Button,
  CloudArrowLeftRightIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  IconPicker,
  Input,
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
}

export function RemoteMCPForm({ owner, mcpServer }: RemoteMCPFormProps) {
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const form = useFormContext<MCPServerFormValues>();
  const { field: iconField } = useController<MCPServerFormValues, "icon">({
    name: "icon",
  });

  const { url, lastError, lastSyncAt } = mcpServer;

  const headerFields = useWatch<MCPServerFormValues, "customHeaders">({
    name: "customHeaders",
  });
  const metaFields = useWatch<MCPServerFormValues, "metaFields">({
    name: "metaFields",
  });
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
          icon={AlertCircleV2}
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
            const toActionIconKey = (v?: string) =>
              v && v in ActionIcons
                ? (v as keyof typeof ActionIcons)
                : undefined;

            const defaultKey = Object.keys(
              ActionIcons
            )[0] as keyof typeof ActionIcons;
            const selectedIconName =
              toActionIconKey(iconField.value) ??
              toActionIconKey(mcpServer.icon as string) ??
              defaultKey;
            const IconComponent =
              ActionIcons[selectedIconName] ?? ActionBookOpenIcon;

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
                  className="w-fit p-0"
                  onInteractOutside={closePopover}
                  onEscapeKeyDown={closePopover}
                >
                  <IconPicker
                    icons={ActionIcons}
                    selectedIcon={selectedIconName}
                    onIconSelect={(iconName: string) => {
                      iconField.onChange(iconName);
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
        <Collapsible>
          <CollapsibleTrigger>
            <div className="heading-lg">Advanced Settings</div>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
          </CollapsibleContent>
        </Collapsible>
      )}

      <Collapsible>
        <CollapsibleTrigger>
          <div className="heading-lg">
            Networking & Headers ({(headerFields ?? []).length})
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2">
            <MCPServerHeaders />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible>
        <CollapsibleTrigger>
          <div className="heading-lg">
            Meta Fields ({(metaFields ?? []).length})
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-500-night">
              Key-value pairs sent as <code className="font-mono">_meta</code>{" "}
              on every tool call to this server.
            </p>
            <MCPServerMetaFields />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
