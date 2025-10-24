import { ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";

export function WebhookSourceHubspotDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.kind !== "hubspot" || !webhookSource.remoteMetadata) {
    return null;
  }

  const metadata = webhookSource.remoteMetadata;
  const subscriptionIds = (metadata as any).subscriptionIds;

  if (!subscriptionIds || Object.keys(subscriptionIds).length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Active Subscriptions</Page.H>
        <div className="space-y-1">
          {Object.keys(subscriptionIds).map((eventType) => (
            <div key={eventType} className="flex items-center gap-2">
              <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                {eventType}
              </span>
            </div>
          ))}
        </div>
        <a
          href={`https://developers.hubspot.com/docs/api-reference/webhooks-webhooks-v3/guide`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 mt-2 inline-flex items-center gap-1 text-xs"
        >
          View HubSpot webhooks documentation
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
