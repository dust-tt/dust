import { ExternalLinkIcon, Page } from "@dust-tt/sparkle";

import type { WebhookSourceType } from "@app/types/triggers/webhooks";

type WebhookSourceGithubDetailsProps = {
  webhookSource: WebhookSourceType;
};

export function WebhookSourceGithubDetails({
  webhookSource,
}: WebhookSourceGithubDetailsProps) {
  if (
    webhookSource.kind !== "github" ||
    !webhookSource.remoteMetadata?.repository
  ) {
    return null;
  }

  const repository = webhookSource.remoteMetadata.repository;

  return (
    <div>
      <Page.H variant="h6">GitHub Repository</Page.H>
      <div className="flex items-center gap-2">
        <Page.P>{repository}</Page.P>
        <a
          href={`https://github.com/${repository}/settings/hooks`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-sm"
        >
          View webhooks
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
