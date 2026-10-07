import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { RECORDING_TYPE_LABELS } from "@app/lib/triggers/built-in-webhooks/fathom/constants";
import { isFathomWebhookMetadata } from "@app/lib/triggers/built-in-webhooks/fathom/types";
import { Chip, Page } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

export function WebhookSourceFathomDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  const { t } = useLingui();

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
        <Page.H variant="h6">
          <Trans>Webhook configuration</Trans>
        </Page.H>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">
          <Trans>Recording types</Trans>
        </div>
        <div className="flex flex-wrap gap-1">
          {triggered_for.length > 0 ? (
            triggered_for.map((type) => (
              <Chip
                key={type}
                label={
                  RECORDING_TYPE_LABELS[type]
                    ? t(RECORDING_TYPE_LABELS[type])
                    : type
                }
                size="xs"
                color="primary"
              />
            ))
          ) : (
            <span className="text-element-600 text-sm">
              <Trans>None configured</Trans>
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">
          <Trans>Included content</Trans>
        </div>
        <div className="flex flex-wrap gap-1">
          {include_transcript && (
            <Chip label={t`Transcript`} size="xs" color="success" />
          )}
          {include_summary && (
            <Chip label={t`Summary`} size="xs" color="success" />
          )}
          {include_action_items && (
            <Chip label={t`Action items`} size="xs" color="success" />
          )}
          {include_crm_matches && (
            <Chip label={t`CRM matches`} size="xs" color="success" />
          )}
        </div>
      </div>
    </div>
  );
}
