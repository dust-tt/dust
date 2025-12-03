import { Chip, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { isAsanaWebhookMetadata } from "@app/lib/triggers/built-in-webhooks/asana/types";

export function WebhookSourceAsanaDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "asana" || !webhookSource.remoteMetadata) {
    return null;
  }

  const { remoteMetadata: metadata } = webhookSource;
  if (!isAsanaWebhookMetadata(metadata)) {
    return null;
  }

  const { workspace, project } = metadata;

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Webhook Configuration</Page.H>
      </div>

      <div className="space-y-3">
        <div>
          <span className="mb-2 text-sm font-medium">Workspace</span>
          <div className="mt-1">
            <Chip label={workspace.name} size="xs" color="primary" />
          </div>
        </div>

        <div>
          <span className="mb-2 text-sm font-medium">Project</span>
          <div className="mt-1">
            <Chip label={project.name} size="xs" color="primary" />
          </div>
        </div>
      </div>
    </div>
  );
}
