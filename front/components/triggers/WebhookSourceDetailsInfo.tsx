import {
  ClipboardIcon,
  EyeIcon,
  EyeSlashIcon,
  IconButton,
  Separator,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { WebhookSourceViewForm } from "@app/components/triggers/WebhookSourceViewForm";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
    {children}
  </label>
);

const Value = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <p
    className={`text-sm text-foreground dark:text-foreground-night ${className}`}
  >
    {children}
  </p>
);

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

  const webhookUrl = useMemo(() => {
    const { url } = config.getDustAPIConfig();
    return `${url}/api/v1/w/${owner.sId}/triggers/hooks/${webhookSourceView.webhookSource.sId}`;
  }, [owner.sId, webhookSourceView.webhookSource.sId]);

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    sendNotification({
      type: "success",
      title: "Webhook URL copied to clipboard",
    });
  };

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
      <div className="heading-lg">Webhook Source Details</div>

      <div className="space-y-6">
        <div>
          <Label>Webhook URL</Label>
          <div className="flex items-center space-x-2">
            <Value className="truncate font-mono">{webhookUrl}</Value>
            <IconButton
              icon={ClipboardIcon}
              onClick={copyWebhookUrl}
              size="xs"
            />
          </div>
        </div>

        <div>
          <Label>Source Name</Label>
          <Value>{webhookSourceView.webhookSource.name}</Value>
        </div>

        {webhookSourceView.webhookSource.secret && (
          <div>
            <Label>Secret</Label>
            <div className="flex items-center space-x-2">
              <Value
                className={`font-mono ${
                  isSecretVisible ? "" : "select-none blur-sm"
                }`}
              >
                {webhookSourceView.webhookSource.secret}
              </Value>
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
              <Label>Signature Header</Label>
              <Value>{webhookSourceView.webhookSource.signatureHeader}</Value>
            </div>

            <div>
              <Label>Signature Algorithm</Label>
              <Value>
                {webhookSourceView.webhookSource.signatureAlgorithm}
              </Value>
            </div>
          </>
        )}

        {webhookSourceView.webhookSource.customHeaders &&
          Object.keys(webhookSourceView.webhookSource.customHeaders).length >
            0 && (
            <div>
              <Label>Custom Headers</Label>
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
