import type { WebhookProvider } from "@app/types/triggers/webhooks";

export type PostWebhookFilterGeneratorResponseBody = {
  filter: string;
};

export type PostWebhookFilterGeneratorRequestBody = {
  naturalDescription: string;
  event: string;
  provider: WebhookProvider;
};
