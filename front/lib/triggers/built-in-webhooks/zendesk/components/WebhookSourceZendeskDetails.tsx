import { ExternalLinkIcon, IconButton, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { ZendeskWebhookStoredMetadataSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/types";

export function WebhookSourceZendeskDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "zendesk" || !webhookSource.remoteMetadata) {
    return null;
  }

  const parsed = ZendeskWebhookStoredMetadataSchema.safeParse(
    webhookSource.remoteMetadata
  );

  const zendeskSubdomain = parsed.success
    ? parsed.data.zendeskSubdomain
    : undefined;
  const webhookId = parsed.success ? parsed.data.webhookId : undefined;

  if (!zendeskSubdomain) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Zendesk Instance</Page.H>
        <div className="flex items-center space-x-2">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono">
            {zendeskSubdomain}.zendesk.com
          </span>
          {webhookId && (
            <a
              href={`https://${zendeskSubdomain}.zendesk.com/admin/apps-integrations/webhooks/webhooks/${webhookId}/details`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-xs"
            >
              <IconButton
                icon={ExternalLinkIcon}
                size="xs"
                tooltip="See webhook"
              />{" "}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
