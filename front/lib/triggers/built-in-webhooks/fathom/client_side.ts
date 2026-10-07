import { CreateWebhookFathomConnection } from "@app/lib/triggers/built-in-webhooks/fathom/components/CreateWebhookFathomConnection";
import { WebhookSourceFathomDetails } from "@app/lib/triggers/built-in-webhooks/fathom/components/WebhookSourceFathomDetails";
import { FATHOM_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import type { ClientSideWebhookPreset } from "@app/lib/triggers/webhooks_client_side";
import { msg } from "@lingui/core/macro";

export const FATHOM_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...FATHOM_WEBHOOK_METADATA,
  description: msg`Receive events from Fathom when meeting recordings are ready with transcripts, summaries, and action items.`,
  icon: "FathomLogo",
  components: {
    detailsComponent: WebhookSourceFathomDetails,
    createFormComponent: CreateWebhookFathomConnection,
  },
};
