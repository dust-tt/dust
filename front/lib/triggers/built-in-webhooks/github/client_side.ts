import { CreateWebhookGithubConnection } from "@app/lib/triggers/built-in-webhooks/github/components/CreateWebhookGithubConnection";
import { WebhookSourceGithubDetails } from "@app/lib/triggers/built-in-webhooks/github/components/WebhookSourceGithubDetails";
import { GITHUB_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/github/preset";
import type { ClientSideWebhookPreset } from "@app/lib/triggers/webhooks_client_side";
import { msg } from "@lingui/core/macro";

export const GITHUB_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...GITHUB_WEBHOOK_METADATA,
  description: msg`Receive events from GitHub such as creation or edition of issues or pull requests.`,
  icon: "GithubLogo",
  components: {
    detailsComponent: WebhookSourceGithubDetails,
    createFormComponent: CreateWebhookGithubConnection,
  },
};
