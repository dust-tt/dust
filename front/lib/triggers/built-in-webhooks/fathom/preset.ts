import type {
  WebhookEventMetadata,
  WebhookPresetMetadata,
} from "@app/types/triggers/webhooks_source_preset";

const FATHOM_MEETING_CONTENT_READY_EVENT = {
  name: "new-meeting-content-ready",
  value: "new-meeting-content-ready" as const,
  description:
    "Triggered when a new meeting recording is ready with its content (transcript, summary, and action items). The event includes meeting details, participants, transcript, AI-generated summary, and action items.",
} satisfies WebhookEventMetadata;

export const FATHOM_WEBHOOK_METADATA = {
  name: "Fathom",
  // No event check, there's only one type of event.
  eventCheck: null,
  events: [FATHOM_MEETING_CONTENT_READY_EVENT],
  description:
    "Receive events from Fathom when meeting recordings are ready with transcripts, summaries, and action items.",
  webhookPageUrl: "https://app.fathom.video/settings/api",
} satisfies WebhookPresetMetadata;
