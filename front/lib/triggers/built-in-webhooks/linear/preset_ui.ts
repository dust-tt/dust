import { CreateWebhookLinearConnection } from "@app/lib/triggers/built-in-webhooks/linear/components/CreateWebhookLinearConnection";
import { WebhookSourceLinearDetails } from "@app/lib/triggers/built-in-webhooks/linear/components/WebhookSourceLinearDetails";
import { LINEAR_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import type { PresetWebhookUi } from "@app/types/triggers/webhooks_source_preset";

export const LINEAR_WEBHOOK_PRESET_UI: PresetWebhookUi<"linear"> = {
  ...LINEAR_WEBHOOK_PRESET,
  components: {
    detailsComponent: WebhookSourceLinearDetails,
    createFormComponent: CreateWebhookLinearConnection,
  },
};
