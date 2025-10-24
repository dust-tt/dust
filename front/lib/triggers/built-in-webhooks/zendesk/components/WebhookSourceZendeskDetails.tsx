import { ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";

export function WebhookSourceZendeskDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "zendesk" || !webhookSource.remoteMetadata) {
    return null;
  }

  const metadata = webhookSource.remoteMetadata;
  const zendeskSubdomain = metadata.zendeskSubdomain as string | undefined;
  const webhookId = metadata.webhookId as string | undefined;

  if (!zendeskSubdomain) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Zendesk Instance</Page.H>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground dark:text-foreground-night">
            {zendeskSubdomain}.zendesk.com
          </span>
          {webhookId && (
            <a
              href={`https://${zendeskSubdomain}.zendesk.com/admin/apps-integrations/webhooks/webhooks/${webhookId}/details`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-xs"
            >
              View webhook
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
