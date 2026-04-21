import { CreateWebhookGithubConnection } from "@app/lib/triggers/built-in-webhooks/github/components/CreateWebhookGithubConnection";
import { WebhookSourceGithubDetails } from "@app/lib/triggers/built-in-webhooks/github/components/WebhookSourceGithubDetails";
import { GITHUB_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/github/preset";
import type { ClientSideWebhookPreset } from "@app/types/triggers/webhooks_source_preset";

export const GITHUB_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...GITHUB_WEBHOOK_PRESET,
  icon: "GithubLogo",
  components: {
    detailsComponent: WebhookSourceGithubDetails,
    createFormComponent: CreateWebhookGithubConnection,
  },
};
