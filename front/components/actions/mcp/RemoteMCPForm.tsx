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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useController, useFieldArray, useFormContext } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import { McpServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";
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
  const { field: iconField } = useController<InfoFormValues, "icon">({
    name: "icon",
  });

  const { url, lastError, lastSyncAt } = mcpServer;

  const initialHeaderRows = useMemo(
    () =>
      Object.entries(mcpServer.customHeaders ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    [mcpServer.customHeaders]
  );
  const { control, getValues } = useFormContext<InfoFormValues>();
  const { fields: headerFields, replace } = useFieldArray({
    control,
    name: "customHeaders",
  });
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.sId);

  useEffect(() => {
    const existing = getValues("customHeaders");
    if (typeof existing === "undefined") {
      replace(initialHeaderRows);
    }
  }, [getValues, initialHeaderRows, replace]);

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
              ActionIcons[selectedIconName] || ActionBookOpenIcon;

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

      <CollapsibleComponent
        triggerChildren={<div className="heading-lg">Networking & Headers</div>}
        contentChildren={
          <div className="space-y-2">
            <McpServerHeaders
              headers={headerFields.map(({ key, value }) => ({ key, value }))}
              onHeadersChange={(rows) => replace(rows)}
            />
          </div>
        }
      />

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
