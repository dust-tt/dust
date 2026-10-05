import { CreateWebhookLinearConnection } from "@app/lib/triggers/built-in-webhooks/linear/components/CreateWebhookLinearConnection";
import { WebhookSourceLinearDetails } from "@app/lib/triggers/built-in-webhooks/linear/components/WebhookSourceLinearDetails";
import { LINEAR_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import type { ClientSideWebhookPreset } from "@app/lib/triggers/webhooks_client_side";

export const LINEAR_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...LINEAR_WEBHOOK_METADATA,
  icon: "LinearLogo",
  components: {
    detailsComponent: WebhookSourceLinearDetails,
    createFormComponent: CreateWebhookLinearConnection,
  },
};
