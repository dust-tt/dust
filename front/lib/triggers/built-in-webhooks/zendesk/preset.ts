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
  filterGenerationInstructions: `Choose operators based on the field type in the JSON Schema:
- Use has, has-all, and has-any only with array fields. For Zendesk ticket events, detail.tags is an array. Example: (has-any "detail.tags" ("vip" "enterprise"))
- Use eq, contains, or starts-with with string fields. detail.status, detail.priority, detail.subject, and event.current/event.previous when present are strings. To match several exact string values, combine eq expressions with or. Example: (or (eq "detail.priority" "HIGH") (eq "detail.priority" "URGENT"))
- Zendesk IDs under detail and event are strings, even when they contain only digits. Compare them to quoted string values with eq.

Never use has, has-all, or has-any with a string field. A type mismatch always evaluates to false.`,
};
