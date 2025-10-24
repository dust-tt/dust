import { ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { FathomAdditionalDataSchema } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_service_types";

export function WebhookSourceFathomDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.kind !== "fathom" || !webhookSource.remoteMetadata) {
    return null;
  }

  const metadata = webhookSource.remoteMetadata;
  const parsed = FathomAdditionalDataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  const { webhookOptions } = parsed.data;

  const enabledOptions = [
    webhookOptions.include_transcript && "Transcript",
    webhookOptions.include_summary && "Summary",
    webhookOptions.include_action_items && "Action Items",
    webhookOptions.include_crm_matches && "CRM Matches",
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Fathom Webhook Configuration</Page.H>
        <div className="space-y-2">
          <div>
            <span className="text-sm font-medium text-foreground dark:text-foreground-night">
              Recording Type:
            </span>
            <span className="ml-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
              Team Recordings
            </span>
          </div>
          <div>
            <span className="text-sm font-medium text-foreground dark:text-foreground-night">
              Included Data:
            </span>
            <span className="ml-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
              {enabledOptions.length > 0
                ? enabledOptions.join(", ")
                : "None"}
            </span>
          </div>
        </div>
      </div>

      <div>
        <a
          href="https://app.fathom.video/settings/integrations"
          target="_blank"
          rel="noopener noreferrer"
          className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-sm"
        >
          Manage webhooks in Fathom
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
