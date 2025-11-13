import { Chip, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import type { LinearTeam } from "@app/lib/triggers/built-in-webhooks/linear/types";
import { isLinearWebhookMetadata } from "@app/lib/triggers/built-in-webhooks/linear/types";

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

  const { teams, allPublicTeams } = metadata;

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Webhook Configuration</Page.H>
      </div>

      {teams && teams.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Teams</div>
          <div className="flex flex-wrap gap-1">
            {teams.map((team) => (
              <Chip
                key={team.id}
                label={`${team.name} (${team.key})`}
                size="xs"
                color="primary"
              />
            ))}
          </div>
        </div>
      )}

      {allPublicTeams && (
        <div>
          <div className="mb-2 text-sm font-medium">Scope</div>
          <Chip label="All Public Teams" size="xs" color="success" />
        </div>
      )}

      {!teams?.length && !allPublicTeams && (
        <div className="text-element-600 text-sm">
          No specific configuration found
        </div>
      )}
    </div>
  );
}
