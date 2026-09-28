import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { MCPServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";
import { MCPServerMetaFields } from "@app/components/actions/mcp/MCPServerMetaFields";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import { useSyncRemoteMCPServer } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionIcons,
  AlertCircle,
  BookOpen01,
  Button,
  CloudArrowLeftRight,
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
  Separator,
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
    <div className="space-y-5 text-foreground">
      {lastError && (
        <ContentMessage
          variant="warning"
          icon={AlertCircle}
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
            icon={CloudArrowLeftRight}
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
            const IconComponent = ActionIcons[selectedIconName] ?? BookOpen01;

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

      <Separator />

      <Collapsible>
        <CollapsibleTrigger>
          <div className="heading-lg">Advanced</div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-5 pt-3">
            {!mcpServer.authorization && (
              <div className="space-y-2">
                <div className="heading-base">Bearer Token</div>
                <Input
                  {...form.register("sharedSecret")}
                  isError={!!form.formState.errors.sharedSecret}
                  message={form.formState.errors.sharedSecret?.message}
                  placeholder="Paste the Bearer Token here"
                />
                <p className="text-xs text-primary-500">
                  This will be sent alongside the request made to your server as
                  a Bearer token in the headers.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="heading-base">
                Networking & Headers ({(headerFields ?? []).length})
              </div>
              <MCPServerHeaders />
            </div>

            <div className="space-y-2">
              <div className="heading-base">
                Meta Fields ({(metaFields ?? []).length})
              </div>
              <p className="text-xs text-primary-500">
                Key-value pairs sent as <code className="font-mono">_meta</code>{" "}
                on every tool call to this server.
              </p>
              <MCPServerMetaFields />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
