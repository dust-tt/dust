import { CreateWebhookFathomConnection } from "@app/lib/triggers/built-in-webhooks/fathom/components/CreateWebhookFathomConnection";
import { WebhookSourceFathomDetails } from "@app/lib/triggers/built-in-webhooks/fathom/components/WebhookSourceFathomDetails";
import { FATHOM_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import type { ClientSideWebhookPreset } from "@app/lib/triggers/webhooks_client_side";

export const FATHOM_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...FATHOM_WEBHOOK_METADATA,
  icon: "FathomLogo",
  components: {
    detailsComponent: WebhookSourceFathomDetails,
    createFormComponent: CreateWebhookFathomConnection,
  },
};
