import { ActionGlobeAltIcon, Avatar } from "@dust-tt/sparkle";

import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

interface WebhookSourceDetailsHeaderProps {
  webhookSourceView: WebhookSourceViewType;
}

export function WebhookSourceDetailsHeader({
  webhookSourceView,
}: WebhookSourceDetailsHeaderProps) {
  return (
    <div className="items-top flex flex-col gap-3 sm:flex-row">
      <Avatar icon={ActionGlobeAltIcon} size="md" />
      <div className="flex grow flex-col gap-0 pr-9">
        <h2 className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
          {webhookSourceView.customName ?? webhookSourceView.webhookSource.name}
        </h2>
        <div className="line-clamp-1 overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
          Webhook source for triggering assistants.
        </div>
      </div>
    </div>
  );
}
