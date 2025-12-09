import { CreateWebhookFathomConnection } from "@app/lib/triggers/built-in-webhooks/fathom/components/CreateWebhookFathomConnection";
import { WebhookSourceFathomDetails } from "@app/lib/triggers/built-in-webhooks/fathom/components/WebhookSourceFathomDetails";
import {
  meetingContentReadyExample,
  meetingContentReadySchema,
} from "@app/lib/triggers/built-in-webhooks/fathom/schemas/meeting_content_ready";
import { FathomWebhookService } from "@app/lib/triggers/built-in-webhooks/fathom/service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const FATHOM_MEETING_CONTENT_READY_EVENT: WebhookEvent = {
  name: "new-meeting-content-ready",
  value: "new-meeting-content-ready",
  description:
    "Triggered when a new meeting recording is ready with its content (transcript, summary, and action items). The event includes meeting details, participants, transcript, AI-generated summary, and action items.",
  schema: meetingContentReadySchema,
  sample: meetingContentReadyExample,
};

export const FATHOM_WEBHOOK_PRESET: PresetWebhook<"fathom"> = {
  name: "Fathom",
  // No event check, there's only one type of event.
  eventCheck: null,
  events: [FATHOM_MEETING_CONTENT_READY_EVENT],
  icon: "FathomLogo",
  description:
    "Receive events from Fathom when meeting recordings are ready with transcripts, summaries, and action items.",
  filterGenerationInstructions: null,
  webhookPageUrl: "https://app.fathom.video/settings/api",
  webhookService: new FathomWebhookService(),
  components: {
    detailsComponent: WebhookSourceFathomDetails,
    createFormComponent: CreateWebhookFathomConnection,
  },
};
