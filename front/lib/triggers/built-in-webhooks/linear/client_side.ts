import { CreateWebhookLinearConnection } from "@app/lib/triggers/built-in-webhooks/linear/components/CreateWebhookLinearConnection";
import { WebhookSourceLinearDetails } from "@app/lib/triggers/built-in-webhooks/linear/components/WebhookSourceLinearDetails";
import { LINEAR_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import type { ClientSideWebhookPreset } from "@app/types/triggers/webhooks_source_preset";

export const LINEAR_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...LINEAR_WEBHOOK_PRESET,
  icon: "LinearLogo",
  components: {
    detailsComponent: WebhookSourceLinearDetails,
    createFormComponent: CreateWebhookLinearConnection,
  },
};
