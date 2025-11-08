import { Chip, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { RECORDING_TYPE_LABELS } from "@app/lib/triggers/built-in-webhooks/fathom/constants";

export function WebhookSourceFathomDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "fathom" || !webhookSource.remoteMetadata) {
    return null;
  }

  const metadata = webhookSource.remoteMetadata;
  const triggeredFor = (metadata.triggered_for as string[]) || [];
  const includeTranscript = metadata.include_transcript === true;
  const includeSummary = metadata.include_summary === true;
  const includeActionItems = metadata.include_action_items === true;
  const includeCrmMatches = metadata.include_crm_matches === true;

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Webhook Configuration</Page.H>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Recording Types</div>
        <div className="flex flex-wrap gap-1">
          {triggeredFor.length > 0 ? (
            triggeredFor.map((type) => (
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
          {includeTranscript && (
            <Chip label="Transcript" size="xs" color="success" />
          )}
          {includeSummary && <Chip label="Summary" size="xs" color="success" />}
          {includeActionItems && (
            <Chip label="Action Items" size="xs" color="success" />
          )}
          {includeCrmMatches && (
            <Chip label="CRM Matches" size="xs" color="success" />
          )}
          {!includeTranscript &&
            !includeSummary &&
            !includeActionItems &&
            !includeCrmMatches && (
              <span className="text-element-600 text-sm">
                No content included
              </span>
            )}
        </div>
      </div>
    </div>
  );
}
