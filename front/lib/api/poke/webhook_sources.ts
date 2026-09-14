import type {
  WebhookSourceAdminDetails,
  WebhookSourceWithCounts,
} from "@app/lib/api/webhook_source";

export type PokeListWebhookSources = {
  webhookSources: WebhookSourceWithCounts[];
};

export type PokeGetWebhookSourceDetails = WebhookSourceAdminDetails;
