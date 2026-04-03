import { CreateWebhookFathomConnection } from "@app/lib/triggers/built-in-webhooks/fathom/components/CreateWebhookFathomConnection";
import { WebhookSourceFathomDetails } from "@app/lib/triggers/built-in-webhooks/fathom/components/WebhookSourceFathomDetails";
import { FATHOM_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import type { PresetWebhookUi } from "@app/types/triggers/webhooks_source_preset";

export const FATHOM_WEBHOOK_PRESET_UI: PresetWebhookUi<"fathom"> = {
  ...FATHOM_WEBHOOK_PRESET,
  components: {
    detailsComponent: WebhookSourceFathomDetails,
    createFormComponent: CreateWebhookFathomConnection,
  },
};
