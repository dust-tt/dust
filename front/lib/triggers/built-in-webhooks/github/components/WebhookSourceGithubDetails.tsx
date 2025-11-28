import { Chip, ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookDetailsComponentProps } from "@app/components/triggers/webhook_preset_components";
import { GithubAdditionalDataSchema } from "@app/lib/triggers/built-in-webhooks/github/types";

export function WebhookSourceGithubDetails({
  webhookSource,
}: WebhookDetailsComponentProps) {
  if (webhookSource.provider !== "github" || !webhookSource.remoteMetadata) {
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
      <div>
        <Page.H variant="h6">Connected Sources</Page.H>
      </div>
      <div>
        {[
          ...organizations.map((org) => [
            org.name,
            `https://github.com/organizations/${org.name}/settings/hooks`,
          ]),
          ...repositories.map((repo) => [
            repo.fullName,
            `https://github.com/${repo.fullName}/settings/hooks`,
          ]),
        ].map(([item, link]) => (
          <Chip
            key={item}
            label={item}
            icon={ExternalLinkIcon}
            size="xs"
            color="primary"
            className="m-0.5"
            onClick={() => {
              window.open(link, "_blank");
            }}
          />
        ))}
      </div>
    </div>
  );
}
