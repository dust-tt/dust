import {
  ClipboardIcon,
  cn,
  EyeIcon,
  EyeSlashIcon,
  IconButton,
  Page,
  Separator,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { WebhookEndpointUsageInfo } from "@app/components/triggers/WebhookEndpointUsageInfo";
import { WebhookSourceViewForm } from "@app/components/triggers/WebhookSourceViewForm";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

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
  const sendNotification = useSendNotification();

  const editedLabel = useMemo(
    () => getEditedLabel(webhookSourceView),
    [webhookSourceView]
  );

  const [isCopied, copy] = useCopyToClipboard();

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
    return `${url}/api/v1/w/${owner.sId}/triggers/hooks/${webhookSourceView.webhookSource.sId}?secret=${webhookSourceView.webhookSource.urlSecret}`;
  }, [
    owner.sId,
    webhookSourceView.webhookSource.sId,
    webhookSourceView.webhookSource.urlSecret,
  ]);

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

        <div>
          <Page.H variant="h6">Source Name</Page.H>
          <Page.P>{webhookSourceView.webhookSource.name}</Page.P>
        </div>

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
