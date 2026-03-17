import { CreateWebhookGithubConnection } from "@app/lib/triggers/built-in-webhooks/github/components/CreateWebhookGithubConnection";
import { WebhookSourceGithubDetails } from "@app/lib/triggers/built-in-webhooks/github/components/WebhookSourceGithubDetails";
import { GITHUB_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/github/preset";
import type { PresetWebhookUi } from "@app/types/triggers/webhooks_source_preset";

export const GITHUB_WEBHOOK_PRESET_UI: PresetWebhookUi<"github"> = {
  ...GITHUB_WEBHOOK_PRESET,
  components: {
    detailsComponent: WebhookSourceGithubDetails,
    createFormComponent: CreateWebhookGithubConnection,
  },
};
