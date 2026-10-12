import { getIcon } from "@app/components/resources/resources_icons";
import type { WebhookSourceFormValues } from "@app/components/triggers/forms/webhookSourceFormSchema";
import { WebhookEndpointUsageInfo } from "@app/components/triggers/WebhookEndpointUsageInfo";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { formatDate } from "@app/lib/i18n/format";
import { WEBHOOK_PRESETS } from "@app/lib/triggers/webhook_presets";
import { CLIENT_SIDE_WEBHOOK_PRESETS } from "@app/lib/triggers/webhooks_client_side";
import { buildWebhookUrl, normalizeWebhookIcon } from "@app/lib/webhook_source";
import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionIcons,
  Button,
  Chip,
  Clipboard,
  Eye,
  EyeOff,
  IconPicker,
  Input,
  Label,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Separator,
  TextArea,
  cn,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

type WebhookSourceDetailsInfoProps = {
  webhookSourceView: WebhookSourceViewForAdminType;
  owner: LightWorkspaceType;
};

export function WebhookSourceDetailsInfo({
  webhookSourceView,
  owner,
}: WebhookSourceDetailsInfoProps) {
  const { t } = useLingui();
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

  const editedLabel = useMemo(() => {
    const { editedByUser } = webhookSourceView;
    if (
      editedByUser === null ||
      (editedByUser.editedAt === null && editedByUser.fullName === null)
    ) {
      return null;
    }
    const editorName = editedByUser.fullName;
    if (editedByUser.editedAt === null) {
      return t`Edited by ${editorName}`;
    }
    const editedAtDateString = formatDate(editedByUser.editedAt);
    if (editorName === null) {
      return t`Edited on ${editedAtDateString}`;
    }

    return t`Edited by ${editorName}, ${editedAtDateString}`;
  }, [webhookSourceView, t]);

  const [, copy] = useCopyToClipboard();

  const selectedIcon = form.watch("icon");
  const IconComponent = getIcon(normalizeWebhookIcon(selectedIcon));

  const webhookUrl = useMemo(() => {
    return buildWebhookUrl({
      apiBaseUrl: config.getApiBaseUrl(),
      workspaceId: owner.sId,
      webhookSource: webhookSourceView.webhookSource,
    });
  }, [owner.sId, webhookSourceView.webhookSource]);

  const handleCopy = async (text: string, successTitle: string) => {
    const ok = await copy(text);
    if (ok) {
      sendNotification({
        type: "success",
        title: successTitle,
      });
    }
  };

  const { provider } = webhookSourceView.webhookSource;

  return (
    <div className="flex flex-col gap-2">
      {editedLabel !== null && (
        <div className="flex w-full justify-end text-sm text-muted-foreground">
          {editedLabel}
        </div>
      )}

      <div className="space-y-5 text-foreground">
        <div className="space-y-2">
          <Label htmlFor="trigger-name-icon">
            {provider ? t`Name` : t`Name & icon`}
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
            {!provider && (
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
                  onInteractOutside={() => setIsPopoverOpen(false)}
                  onEscapeKeyDown={() => setIsPopoverOpen(false)}
                >
                  <IconPicker
                    icons={ActionIcons}
                    selectedIcon={normalizeWebhookIcon(selectedIcon)}
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
          <Label htmlFor="trigger-description">
            <Trans>Description</Trans>
          </Label>
          <TextArea
            {...descriptionField}
            id="trigger-description"
            rows={3}
            placeholder={t`Help your team understand when to use this trigger.`}
          />
        </div>
      </div>

      <Separator className="mb-4 mt-4" />
      <Page.H variant="h4">
        <Trans>Webhook source details</Trans>
      </Page.H>

      <div className="space-y-6">
        <div>
          <Page.H variant="h6">
            <Trans>Webhook URL</Trans>
          </Page.H>
          <div className="flex items-center space-x-2">
            <p className="dd-privacy-mask min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {webhookUrl}
            </p>
            <Button
              icon={Clipboard}
              onClick={() =>
                handleCopy(webhookUrl, t`Webhook URL copied to clipboard`)
              }
              size="xs"
              variant="ghost-secondary"
            />
          </div>
        </div>

        {provider &&
          (() => {
            const DetailsComponent =
              CLIENT_SIDE_WEBHOOK_PRESETS[provider].components.detailsComponent;
            return (
              <DetailsComponent
                webhookSource={webhookSourceView.webhookSource}
              />
            );
          })()}
        {provider && WEBHOOK_PRESETS[provider].events.length > 0 && (
          <div className="space-y-3">
            <Page.H variant="h6">
              <Trans>Subscribed events</Trans>
            </Page.H>
            <div>
              {webhookSourceView.webhookSource.subscribedEvents
                .map((eventValue) => {
                  const event = WEBHOOK_PRESETS[provider].events.find(
                    (e) => e.value === eventValue
                  );
                  return event ? event.name : eventValue;
                })
                .map((event) => {
                  return (
                    <Chip
                      key={event}
                      size="xs"
                      color="primary"
                      className="m-0.5"
                    >
                      {event}
                    </Chip>
                  );
                })}
            </div>
          </div>
        )}
        {webhookSourceView.webhookSource.secret && (
          <div>
            <Page.H variant="h6">
              <Trans>Secret</Trans>
            </Page.H>
            <div className="flex items-center space-x-2">
              <p
                className={cn(
                  "dd-privacy-mask min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono",
                  {
                    "select-none blur-sm": !isSecretVisible,
                  }
                )}
              >
                {webhookSourceView.webhookSource.secret}
              </p>
              <div>
                <Button
                  icon={isSecretVisible ? EyeOff : Eye}
                  onClick={() => setIsSecretVisible((prev) => !prev)}
                  size="xs"
                  variant="ghost-secondary"
                />
                <Button
                  icon={Clipboard}
                  onClick={() =>
                    handleCopy(
                      webhookSourceView.webhookSource.secret ?? "",
                      t`Secret copied to clipboard`
                    )
                  }
                  size="xs"
                  variant="ghost-secondary"
                />
              </div>
            </div>
          </div>
        )}
        {webhookSourceView.webhookSource.signatureHeader && (
          <>
            <div>
              <Page.H variant="h6">
                <Trans>Signature header</Trans>
              </Page.H>
              <Page.P>{webhookSourceView.webhookSource.signatureHeader}</Page.P>
            </div>

            <div>
              <Page.H variant="h6">
                <Trans>Signature algorithm</Trans>
              </Page.H>
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
