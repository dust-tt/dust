import { Chip, ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { JiraAdditionalDataSchema } from "@app/lib/triggers/built-in-webhooks/jira/types";

export function WebhookSourceJiraDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "jira" || !webhookSource.remoteMetadata) {
    return null;
  }

  const metadata = webhookSource.remoteMetadata;
  const parsed = JiraAdditionalDataSchema.safeParse(metadata);

  const projects = parsed.success ? parsed.data.projects : [];

  if (projects.length === 0) {
    return null;
  }

  const { cloudId } = metadata;

  return (
    <div className="space-y-4">
      <div>
        <Page.H variant="h6">Connected Sources</Page.H>
      </div>
      <div>
        {projects.map((project) => (
          <Chip
            key={project.key}
            label={`${project.key} - ${project.name}`}
            icon={ExternalLinkIcon}
            size="xs"
            color="primary"
            className="m-0.5"
            onClick={
              cloudId
                ? () => {
                    window.open(
                      `https://api.atlassian.com/ex/jira/${cloudId}/secure/admin/WebHookAdmin.jspa`,
                      "_blank"
                    );
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
