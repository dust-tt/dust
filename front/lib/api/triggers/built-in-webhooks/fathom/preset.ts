import {
  meetingContentReadyExample,
  meetingContentReadySchema,
} from "@app/lib/api/triggers/built-in-webhooks/fathom/schemas/meeting_content_ready";
import { FATHOM_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import type {
  BaseWebhookPreset,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const eventPayloads = {
  "new-meeting-content-ready": {
    schema: meetingContentReadySchema,
    sample: meetingContentReadyExample,
  },
} satisfies Record<
  (typeof FATHOM_WEBHOOK_METADATA.events)[number]["value"],
  Pick<WebhookEvent, "schema" | "sample">
>;

export const FATHOM_WEBHOOK_PRESET: BaseWebhookPreset = {
  ...FATHOM_WEBHOOK_METADATA,
  events: FATHOM_WEBHOOK_METADATA.events.map((event) => ({
    ...event,
    ...eventPayloads[event.value],
  })),
  filterGenerationInstructions: null,
};
