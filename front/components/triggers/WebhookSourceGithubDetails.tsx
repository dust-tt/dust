import { ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";

export function WebhookSourceGithubDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.kind !== "github" || !webhookSource.remoteMetadata) {
    return null;
  }

  const metadata = webhookSource.remoteMetadata;

  // Normalize legacy format (single repository) into array format
  const legacyRepository = metadata.repository as string | undefined;
  let repositories = (metadata.repositories as string[]) || [];

  // If legacy format exists and no new format, use it
  if (legacyRepository && repositories.length === 0) {
    repositories = [legacyRepository];
  }

  const organizations = (metadata.organizations as string[]) || [];

  const hasRepositories = repositories.length > 0;
  const hasOrganizations = organizations.length > 0;

  if (!hasRepositories && !hasOrganizations) {
    return null;
  }

  return (
    <div className="space-y-4">
      {hasRepositories && (
        <div>
          <Page.H variant="h6">
            GitHub {repositories.length === 1 ? "Repository" : "Repositories"}
          </Page.H>
          <div className="space-y-2">
            {repositories.map((repository) => (
              <div key={repository} className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                  {repository}
                </span>
                <a
                  href={`https://github.com/${repository}/settings/hooks`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-xs"
                >
                  View webhooks
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasOrganizations && (
        <div>
          <Page.H variant="h6">
            GitHub{" "}
            {organizations.length === 1 ? "Organization" : "Organizations"}
          </Page.H>
          <div className="space-y-2">
            {organizations.map((organization) => (
              <div key={organization} className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                  {organization}
                </span>
                <a
                  href={`https://github.com/organizations/${organization}/settings/hooks`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-xs"
                >
                  View webhooks
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
