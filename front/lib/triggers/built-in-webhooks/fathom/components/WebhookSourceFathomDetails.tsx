import { Chip, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { RECORDING_TYPE_LABELS } from "@app/lib/triggers/built-in-webhooks/fathom/constants";
import { isFathomWebhookMetadata } from "@app/lib/triggers/built-in-webhooks/fathom/types";

export function WebhookSourceFathomDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "fathom" || !webhookSource.remoteMetadata) {
    return null;
  }

  const { remoteMetadata: metadata } = webhookSource;
  if (!isFathomWebhookMetadata(metadata)) {
    return null;
  }

  const {
    triggered_for,
    include_transcript,
    include_summary,
    include_action_items,
    include_crm_matches,
  } = metadata;

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Webhook Configuration</Page.H>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Recording Types</div>
        <div className="flex flex-wrap gap-1">
          {triggered_for.length > 0 ? (
            triggered_for.map((type) => (
              <Chip
                key={type}
                label={RECORDING_TYPE_LABELS[type] || type}
                size="xs"
                color="primary"
              />
            ))
          ) : (
            <span className="text-element-600 text-sm">None configured</span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Included Content</div>
        <div className="flex flex-wrap gap-1">
          {include_transcript && (
            <Chip label="Transcript" size="xs" color="success" />
          )}
          {include_summary && (
            <Chip label="Summary" size="xs" color="success" />
          )}
          {include_action_items && (
            <Chip label="Action Items" size="xs" color="success" />
          )}
          {include_crm_matches && (
            <Chip label="CRM Matches" size="xs" color="success" />
          )}
        </div>
      </div>
    </div>
  );
}
