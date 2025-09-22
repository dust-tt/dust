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
import { useController, useFormContext } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import { McpServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";
import type { MCPServerViewType, RemoteMCPServerType } from "@app/lib/api/mcp";
import {
  useSyncRemoteMCPServer,
  useUpdateMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { sanitizeHeadersArray } from "@app/types";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
  mcpServerView: MCPServerViewType;
}

export function RemoteMCPForm({
  owner,
  mcpServer,
  mcpServerView,
}: RemoteMCPFormProps) {
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
  const [headersRows, setHeadersRows] =
    useState<{ key: string; value: string }[]>(initialHeaderRows);
  const [headersDirty, setHeadersDirty] = useState(false);

  const { updateServer } = useUpdateMCPServer(owner, mcpServerView);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.sId);

  const sanitizeHeaders = useCallback(
    (rows: { key: string; value: string }[]) => sanitizeHeadersArray(rows),
    []
  );

  const onSaveHeaders = useCallback(async () => {
    const sanitized = sanitizeHeaders(headersRows);
    const ok = await updateServer({ customHeaders: sanitized });
    if (ok) {
      // After the SWR mutate from the hook refreshes, the effect below
      // will sync local rows from mcpServer.customHeaders.
      setHeadersDirty(false);
    }
  }, [headersRows, sanitizeHeaders, updateServer]);

  // Keep local headers state in sync with server when not dirty
  useEffect(() => {
    if (!headersDirty) {
      setHeadersRows(
        Object.entries(mcpServer.customHeaders ?? {}).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      );
    }
  }, [mcpServer.customHeaders, headersDirty]);

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
              headers={headersRows}
              onHeadersChange={(rows) => {
                setHeadersRows(rows);
                setHeadersDirty(true);
              }}
            />
            {headersDirty && (
              <div className="flex flex-row items-end justify-end gap-2">
                <Button
                  variant="outline"
                  label={"Cancel"}
                  onClick={() => {
                    setHeadersRows(initialHeaderRows);
                    setHeadersDirty(false);
                  }}
                />
                <Button
                  variant="highlight"
                  label={"Save"}
                  onClick={() => {
                    void onSaveHeaders();
                  }}
                />
              </div>
            )}
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
