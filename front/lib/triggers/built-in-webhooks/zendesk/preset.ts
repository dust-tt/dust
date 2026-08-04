import { ZENDESK_WEBHOOK_EVENTS } from "@app/lib/triggers/built-in-webhooks/zendesk/events";
import type { BaseWebhookPreset } from "@app/types/triggers/webhooks_source_preset";

export const ZENDESK_WEBHOOK_PRESET: BaseWebhookPreset = {
  name: "Zendesk",
  eventCheck: {
    type: "body",
    field: "type",
  },
  events: ZENDESK_WEBHOOK_EVENTS,
  description:
    "Receive events from Zendesk such as ticket creation or modification",
  filterGenerationInstructions: null,
};
