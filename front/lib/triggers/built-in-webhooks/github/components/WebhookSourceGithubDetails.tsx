import { ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { GithubAdditionalDataSchema } from "@app/lib/triggers/built-in-webhooks/github/github_service_types";

export function WebhookSourceGithubDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.kind !== "github" || !webhookSource.remoteMetadata) {
    return null;
  }

  const metadata = webhookSource.remoteMetadata;
  const parsed = GithubAdditionalDataSchema.safeParse(metadata);

  // Normalize legacy format (single repository) into array format
  const legacyRepository = metadata.repository as string | undefined;
  let repositories = parsed.success ? parsed.data.repositories : [];

  // If legacy format exists and no new format, use it
  if (legacyRepository && repositories.length === 0) {
    repositories = [{ fullName: legacyRepository }];
  }

  const organizations = parsed.success ? parsed.data.organizations : [];

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
              <div
                key={repository.fullName}
                className="flex items-center gap-2"
              >
                <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                  {repository.fullName}
                </span>
                <a
                  href={`https://github.com/${repository.fullName}/settings/hooks`}
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
              <div key={organization.name} className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                  {organization.name}
                </span>
                <a
                  href={`https://github.com/organizations/${organization.name}/settings/hooks`}
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
