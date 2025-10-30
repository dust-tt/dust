import { ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { JiraAdditionalDataSchema } from "@app/lib/triggers/built-in-webhooks/jira/jira_api_types";

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
        <Page.H variant="h6">
          Jira {projects.length === 1 ? "Project" : "Projects"}
        </Page.H>
        <div className="space-y-2">
          {projects.map((project) => (
            <div key={project.key} className="flex items-center gap-2">
              <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                {project.key}
              </span>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {project.name}
              </span>
              {cloudId && (
                <a
                  href={`https://api.atlassian.com/ex/jira/${cloudId}/secure/admin/WebHookAdmin.jspa`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-xs"
                >
                  View webhooks
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
