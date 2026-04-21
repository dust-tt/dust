import { CreateWebhookFathomConnection } from "@app/lib/triggers/built-in-webhooks/fathom/components/CreateWebhookFathomConnection";
import { WebhookSourceFathomDetails } from "@app/lib/triggers/built-in-webhooks/fathom/components/WebhookSourceFathomDetails";
import { FATHOM_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import type { ClientSideWebhookPreset } from "@app/types/triggers/webhooks_source_preset";

export const FATHOM_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...FATHOM_WEBHOOK_PRESET,
  icon: "FathomLogo",
  components: {
    detailsComponent: WebhookSourceFathomDetails,
    createFormComponent: CreateWebhookFathomConnection,
  },
};
