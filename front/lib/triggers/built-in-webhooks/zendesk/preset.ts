import { ZENDESK_WEBHOOK_EVENTS } from "@app/lib/triggers/built-in-webhooks/zendesk/events";
import { ZendeskWebhookService } from "@app/lib/triggers/built-in-webhooks/zendesk/service";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";

export const ZENDESK_WEBHOOK_PRESET: PresetWebhook<"zendesk"> = {
  name: "Zendesk",
  eventCheck: {
    type: "body",
    field: "type",
  },
  events: ZENDESK_WEBHOOK_EVENTS,
  icon: "ZendeskLogo",
  description:
    "Receive events from Zendesk such as ticket creation or modification",
  webhookService: new ZendeskWebhookService(),
  filterGenerationInstructions: null,
};
