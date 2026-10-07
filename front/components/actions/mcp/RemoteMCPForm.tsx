import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { MCPServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";
import { MCPServerMetaFields } from "@app/components/actions/mcp/MCPServerMetaFields";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import { formatDateTime } from "@app/lib/i18n/format";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

interface RemoteMCPFormProps {
  owner: LightWorkspaceType;
  mcpServer: RemoteMCPServerType;
}

export function RemoteMCPForm({ owner, mcpServer }: RemoteMCPFormProps) {
  const { t } = useLingui();
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
  const lastSyncDate = lastSyncAt ? formatDateTime(lastSyncAt) : null;
  const headerCount = (headerFields ?? []).length;
  const metaFieldCount = (metaFields ?? []).length;

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
          variant="info"
          icon={AlertCircle}
          size="sm"
          title={t`Synchronization warning`}
        >
          {lastSyncDate ? (
            <Trans>
              Server could not synchronize successfully. Last attempt on{" "}
              {lastSyncDate}: {lastError}
            </Trans>
          ) : (
            <Trans>
              Server could not synchronize successfully. Last attempt:{" "}
              {lastError}
            </Trans>
          )}
        </ContentMessage>
      )}

      <div className="space-y-2">
        <Label htmlFor="url">
          <Trans>Server URL & icon</Trans>
        </Label>
        <div className="flex space-x-2">
          <div className="flex-grow">
            <Input
              value={url}
              disabled
              placeholder="https://example.com/api/mcp"
            />
          </div>
          <Button
            label={isSynchronizing ? t`Syncing...` : t`Sync`}
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
          <div className="heading-lg">
            <Trans>Advanced</Trans>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-5 pt-3">
            {!mcpServer.authorization && (
              <div className="space-y-2">
                <div className="heading-base">
                  <Trans>Bearer token</Trans>
                </div>
                <Input
                  {...form.register("sharedSecret")}
                  isError={!!form.formState.errors.sharedSecret}
                  message={form.formState.errors.sharedSecret?.message}
                  placeholder={t`Paste the bearer token here`}
                />
                <p className="text-xs text-primary-500">
                  <Trans>
                    This will be sent alongside the request made to your server
                    as a Bearer token in the headers.
                  </Trans>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="heading-base">
                <Trans>Networking & headers ({headerCount})</Trans>
              </div>
              <MCPServerHeaders />
            </div>

            <div className="space-y-2">
              <div className="heading-base">
                <Trans>Meta fields ({metaFieldCount})</Trans>
              </div>
              <p className="text-xs text-primary-500">
                <Trans>
                  Key-value pairs sent as{" "}
                  <code className="font-mono">_meta</code> on every tool call to
                  this server.
                </Trans>
              </p>
              <MCPServerMetaFields />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
