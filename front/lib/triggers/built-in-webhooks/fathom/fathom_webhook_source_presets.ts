import { ClipboardIcon } from "@dust-tt/sparkle";

import { CreateWebhookFathomConnection } from "@app/lib/triggers/built-in-webhooks/fathom/components/CreateWebhookFathomConnection";
import { WebhookSourceFathomDetails } from "@app/lib/triggers/built-in-webhooks/fathom/components/WebhookSourceFathomDetails";
import { FathomWebhookService } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_webhook_service";
import { meetingContentReadySchema } from "@app/lib/triggers/built-in-webhooks/fathom/schemas/json_schema_meeting_content_ready";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const FATHOM_MEETING_CONTENT_READY_EVENT: WebhookEvent = {
  name: "new-meeting-content-ready",
  value: "new-meeting-content-ready",
  description:
    "Triggered when meeting content (transcript, summary, action items) is ready after a recording completes.",
  schema: meetingContentReadySchema,
};

export const FATHOM_WEBHOOK_PRESET: PresetWebhook = {
  name: "Fathom",
  eventCheck: {
    type: "body",
    field: "recording_id",
  },
  events: [FATHOM_MEETING_CONTENT_READY_EVENT],
  icon: ClipboardIcon,
  description:
    "Receive notifications when Fathom meeting recordings are ready, including transcripts, summaries, and action items.",
  featureFlag: "hootl_dev_webhooks",
  webhookService: new FathomWebhookService(),
  components: {
    detailsComponent: WebhookSourceFathomDetails,
    createFormComponent: CreateWebhookFathomConnection,
  },
};
