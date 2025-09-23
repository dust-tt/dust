import {
  Button,
  ClipboardIcon,
  cn,
  EyeIcon,
  EyeSlashIcon,
  IconButton,
  Input,
  Label,
  Page,
  PencilSquareIcon,
  Separator,
  TextArea,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { WebhookSourceViewForm } from "@app/components/triggers/WebhookSourceViewForm";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type {
  PatchWebhookSourceBody,
  WebhookSourceViewType,
} from "@app/types/triggers/webhooks";
import { patchWebhookSourceBodySchema } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsInfoProps = {
  webhookSourceView: WebhookSourceViewType;
  owner: LightWorkspaceType;
};

const getEditedLabel = (webhookSourceView: WebhookSourceViewType) => {
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
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const sendNotification = useSendNotification();

  const editedLabel = useMemo(
    () => getEditedLabel(webhookSourceView),
    [webhookSourceView]
  );

  const [isCopied, copy] = useCopyToClipboard();
  const { mutateWebhookSourcesWithViews } = useWebhookSourcesWithViews({
    owner,
    disabled: true,
  });

  const detailsForm = useForm<PatchWebhookSourceBody>({
    resolver: zodResolver(patchWebhookSourceBodySchema),
    defaultValues: {
      description: webhookSourceView.webhookSource.description,
      icon: webhookSourceView.webhookSource.icon,
    },
  });

  const updateWebhookSource = useCallback(
    async (values: PatchWebhookSourceBody) => {
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/webhook_sources/${webhookSourceView.webhookSource.sId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(values),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update webhook source");
        }

        sendNotification({
          type: "success",
          title: "Webhook source updated successfully",
        });

        await mutateWebhookSourcesWithViews();
        setIsEditingDetails(false);
        detailsForm.reset(values);
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to update webhook source",
        });
      }
    },
    [
      owner.sId,
      webhookSourceView.webhookSource.sId,
      sendNotification,
      mutateWebhookSourcesWithViews,
      detailsForm,
    ]
  );

  useEffect(() => {
    if (isCopied) {
      sendNotification({
        type: "success",
        title: "Webhook URL copied to clipboard",
      });
    }
  }, [isCopied, sendNotification]);

  const webhookUrl = useMemo(() => {
    const { url } = config.getDustAPIConfig();
    return `${url}/api/v1/w/${owner.sId}/triggers/hooks/${webhookSourceView.webhookSource.sId}`;
  }, [owner.sId, webhookSourceView.webhookSource.sId]);

  return (
    <div className="flex flex-col gap-2">
      {editedLabel !== null && (
        <div className="flex w-full justify-end text-sm text-muted-foreground dark:text-muted-foreground-night">
          {editedLabel}
        </div>
      )}

      <WebhookSourceViewForm
        webhookSourceView={webhookSourceView}
        owner={owner}
      />

      <Separator className="mb-4 mt-4" />
      <Page.H variant="h4">Webhook Source Details</Page.H>

      <div className="space-y-6">
        <div>
          <Page.H variant="h6">Webhook URL</Page.H>
          <div className="flex items-center space-x-2">
            <Page.P>{webhookUrl}</Page.P>
            <IconButton
              icon={ClipboardIcon}
              onClick={() => copy(webhookUrl)}
              size="xs"
            />
          </div>
        </div>

        <div>
          <Page.H variant="h6">Source Name</Page.H>
          <Page.P>{webhookSourceView.webhookSource.name}</Page.P>
        </div>

        {!isEditingDetails ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex-grow">
                {webhookSourceView.webhookSource.description ? (
                  <div>
                    <Page.H variant="h6">Description</Page.H>
                    <Page.P>{webhookSourceView.webhookSource.description}</Page.P>
                  </div>
                ) : (
                  <div>
                    <Page.H variant="h6">Description</Page.H>
                    <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      No description set
                    </div>
                  </div>
                )}
              </div>
              <IconButton
                icon={PencilSquareIcon}
                onClick={() => setIsEditingDetails(true)}
                size="xs"
                tooltip="Edit description and icon"
              />
            </div>

            {webhookSourceView.webhookSource.icon && (
              <div>
                <Page.H variant="h6">Icon</Page.H>
                <Page.P>{webhookSourceView.webhookSource.icon}</Page.P>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <Controller
              control={detailsForm.control}
              name="description"
              render={({ field }) => (
                <>
                  <Label htmlFor="description">Description</Label>
                  <TextArea
                    {...field}
                    value={field.value ?? ""}
                    id="description"
                    placeholder="Describe the purpose of this webhook source..."
                    error={detailsForm.formState.errors.description?.message}
                    showErrorLabel={true}
                    rows={3}
                  />
                </>
              )}
            />

            <Controller
              control={detailsForm.control}
              name="icon"
              render={({ field }) => (
                <Input
                  {...field}
                  value={field.value ?? ""}
                  label="Icon"
                  placeholder="e.g., 🔗, 🚀, or an emoji"
                  isError={!!detailsForm.formState.errors.icon}
                  message={detailsForm.formState.errors.icon?.message}
                  messageStatus="error"
                />
              )}
            />

            <div className="flex flex-row items-end justify-end gap-2">
              <Button
                variant="outline"
                label="Cancel"
                disabled={detailsForm.formState.isSubmitting}
                onClick={() => {
                  detailsForm.reset();
                  setIsEditingDetails(false);
                }}
              />

              <Button
                variant="highlight"
                label={detailsForm.formState.isSubmitting ? "Saving..." : "Save"}
                disabled={detailsForm.formState.isSubmitting}
                onClick={async (event) => {
                  event.preventDefault();
                  void detailsForm.handleSubmit(updateWebhookSource)();
                }}
              />
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

        {webhookSourceView.webhookSource.customHeaders &&
          Object.keys(webhookSourceView.webhookSource.customHeaders).length >
            0 && (
            <div>
              <Page.H variant="h6">Custom Headers</Page.H>
              <div className="mt-2 space-y-1">
                {Object.entries(
                  webhookSourceView.webhookSource.customHeaders
                ).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center space-x-2 text-sm"
                  >
                    <span className="font-mono text-muted-foreground dark:text-muted-foreground-night">
                      {key}:
                    </span>
                    <span className="text-foreground dark:text-foreground-night">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
