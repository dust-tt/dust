import {
  ActionIcons,
  Button,
  Checkbox,
  ClipboardIcon,
  cn,
  EyeIcon,
  EyeSlashIcon,
  IconButton,
  IconPicker,
  Input,
  Label,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Separator,
  TextArea,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import { getIcon } from "@app/components/resources/resources_icons";
import type { WebhookSourceFormValues } from "@app/components/triggers/forms/webhookSourceFormSchema";
import { WebhookEndpointUsageInfo } from "@app/components/triggers/WebhookEndpointUsageInfo";
import { WebhookSourceGithubDetails } from "@app/components/triggers/WebhookSourceGithubDetails";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import {
  buildWebhookUrl,
  DEFAULT_WEBHOOK_ICON,
  normalizeWebhookIcon,
} from "@app/lib/webhookSource";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsInfoProps = {
  webhookSourceView: WebhookSourceViewForAdminType;
  owner: LightWorkspaceType;
};

const getEditedLabel = (webhookSourceView: WebhookSourceViewForAdminType) => {
  if (
    webhookSourceView.editedByUser === null ||
    (webhookSourceView.editedByUser.editedAt === null &&
      webhookSourceView.editedByUser.fullName === null)
  ) {
    return null;
  }
  if (webhookSourceView.editedByUser.editedAt === null) {
    return `Edited by ${webhookSourceView.editedByUser.fullName}`;
  }
  const editedAtDateString = new Date(
    webhookSourceView.editedByUser.editedAt
  ).toLocaleDateString();
  if (webhookSourceView.editedByUser.fullName === null) {
    return `Edited on ${editedAtDateString}`;
  }

  return `Edited by ${webhookSourceView.editedByUser.fullName}, ${editedAtDateString}`;
};

export function WebhookSourceDetailsInfo({
  webhookSourceView,
  owner,
}: WebhookSourceDetailsInfoProps) {
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const sendNotification = useSendNotification();
  const form = useFormContext<WebhookSourceFormValues>();

  const { field: nameField, fieldState: nameFieldState } = useController({
    control: form.control,
    name: "name",
  });

  const { field: descriptionField } = useController({
    control: form.control,
    name: "description",
  });

  const editedLabel = useMemo(
    () => getEditedLabel(webhookSourceView),
    [webhookSourceView]
  );

  const [isCopied, copy] = useCopyToClipboard();

  const selectedIcon = form.watch("icon");
  const IconComponent = getIcon(normalizeWebhookIcon(selectedIcon));

  useEffect(() => {
    if (isCopied) {
      sendNotification({
        type: "success",
        title: "Webhook URL copied to clipboard",
      });
    }
  }, [isCopied, sendNotification]);

  const webhookUrl = useMemo(() => {
    return buildWebhookUrl({
      apiBaseUrl: config.getDustAPIConfig().url,
      workspaceId: owner.sId,
      webhookSource: webhookSourceView.webhookSource,
    });
  }, [owner.sId, webhookSourceView.webhookSource]);

  const isCustomKind = webhookSourceView.webhookSource.kind === "custom";

  return (
    <div className="flex flex-col gap-2">
      {editedLabel !== null && (
        <div className="flex w-full justify-end text-sm text-muted-foreground dark:text-muted-foreground-night">
          {editedLabel}
        </div>
      )}

      <div className="space-y-5 text-foreground dark:text-foreground-night">
        <div className="space-y-2">
          <Label htmlFor="trigger-name-icon">
            {isCustomKind ? "Name & Icon" : "Name"}
          </Label>
          <div className="flex items-end space-x-2">
            <div className="flex-grow">
              <Input
                {...nameField}
                id="trigger-name-icon"
                isError={!!nameFieldState.error}
                message={nameFieldState.error?.message}
                placeholder={webhookSourceView.webhookSource.name}
              />
            </div>
            {isCustomKind && (
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
                  onInteractOutside={() => setIsPopoverOpen(false)}
                  onEscapeKeyDown={() => setIsPopoverOpen(false)}
                >
                  <IconPicker
                    icons={ActionIcons}
                    selectedIcon={selectedIcon ?? DEFAULT_WEBHOOK_ICON}
                    onIconSelect={(iconName: string) => {
                      form.setValue("icon", iconName, { shouldDirty: true });
                      setIsPopoverOpen(false);
                    }}
                  />
                </PopoverContent>
              </PopoverRoot>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="trigger-description">Description</Label>
          <TextArea
            {...descriptionField}
            id="trigger-description"
            rows={3}
            placeholder="Enter a description for this trigger"
          />
        </div>
      </div>

      <Separator className="mb-4 mt-4" />
      <Page.H variant="h4">Webhook Source Details</Page.H>

      <div className="space-y-6">
        <div>
          <Page.H variant="h6">Webhook URL</Page.H>
          <div className="flex items-center space-x-2">
            <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {webhookUrl}
            </p>
            <IconButton
              icon={ClipboardIcon}
              onClick={() => copy(webhookUrl)}
              size="xs"
            />
          </div>
        </div>

        {webhookSourceView.webhookSource.kind === "github" && (
          <WebhookSourceGithubDetails
            webhookSource={webhookSourceView.webhookSource}
          />
        )}

        <div>
          <Page.H variant="h6">Source Name</Page.H>
          <Page.P>{webhookSourceView.webhookSource.name}</Page.P>
        </div>
        {webhookSourceView.webhookSource.kind !== "custom" &&
          WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[
            webhookSourceView.webhookSource.kind
          ].events.length > 0 && (
            <div className="space-y-3">
              <Page.H variant="h6">Subscribed events</Page.H>
              <div className="space-y-2">
                {WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[
                  webhookSourceView.webhookSource.kind
                ].events.map((event) => {
                  const isSubscribed =
                    webhookSourceView.webhookSource.subscribedEvents.includes(
                      event.value
                    );
                  return (
                    <div
                      key={event.value}
                      className="flex items-center space-x-3"
                    >
                      <Checkbox
                        id={`${webhookSourceView.webhookSource.kind}-event-${event.value}`}
                        checked={isSubscribed}
                        disabled
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor={`${webhookSourceView.webhookSource.kind}-event-${event.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {event.name}
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        {webhookSourceView.webhookSource.secret && (
          <div>
            <Page.H variant="h6">Secret</Page.H>
            <div className="flex items-center space-x-2">
              <div
                className={cn("font-mono", {
                  "select-none blur-sm": !isSecretVisible,
                })}
              >
                <Page.P>{webhookSourceView.webhookSource.secret}</Page.P>
              </div>
              <IconButton
                icon={isSecretVisible ? EyeSlashIcon : EyeIcon}
                onClick={() => setIsSecretVisible((prev) => !prev)}
                size="xs"
              />
            </div>
          </div>
        )}
        {webhookSourceView.webhookSource.signatureHeader && (
          <>
            <div>
              <Page.H variant="h6">Signature Header</Page.H>
              <Page.P>{webhookSourceView.webhookSource.signatureHeader}</Page.P>
            </div>

            <div>
              <Page.H variant="h6">Signature Algorithm</Page.H>
              <Page.P>
                {webhookSourceView.webhookSource.signatureAlgorithm}
              </Page.P>
            </div>
          </>
        )}
        {webhookSourceView.webhookSource.secret &&
          webhookSourceView.webhookSource.signatureHeader &&
          webhookSourceView.webhookSource.signatureAlgorithm && (
            <>
              <Separator className="mb-4 mt-4" />
              <WebhookEndpointUsageInfo
                signatureAlgorithm={
                  webhookSourceView.webhookSource.signatureAlgorithm
                }
                signatureHeader={
                  webhookSourceView.webhookSource.signatureHeader
                }
              />
            </>
          )}
      </div>
    </div>
  );
}
