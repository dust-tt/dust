import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import type { LinearTeam } from "@app/lib/triggers/built-in-webhooks/linear/types";
import { isLinearWebhookMetadata } from "@app/lib/triggers/built-in-webhooks/linear/types";
import { Chip, Page } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

export function WebhookSourceLinearDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "linear" || !webhookSource.remoteMetadata) {
    return null;
  }

  const { remoteMetadata: metadata } = webhookSource;
  if (!isLinearWebhookMetadata(metadata)) {
    return null;
  }

  const { teams } = metadata;

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">
          <Trans>Webhook configuration</Trans>
        </Page.H>
      </div>

      {teams && teams.length > 0 ? (
        <div>
          <span className="mb-2 text-sm font-medium">
            <Trans>Teams</Trans>
          </span>
          <div className="flex flex-wrap gap-1">
            {teams.map((team: LinearTeam) => (
              <Chip
                key={team.id}
                label={`${team.name} (${team.key})`}
                size="xs"
                color="primary"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-element-600 text-sm">
          <Trans>No team configuration found</Trans>
        </div>
      )}
    </div>
  );
}
