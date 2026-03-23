import { ZendeskOAuthExtraConfig } from "@app/components/data_source/ZendeskOAuthExtraConfig";
import { CreateWebhookZendeskConnection } from "@app/lib/triggers/built-in-webhooks/zendesk/components/CreateWebhookZendeskConnection";
import { WebhookSourceZendeskDetails } from "@app/lib/triggers/built-in-webhooks/zendesk/components/WebhookSourceZendeskDetails";
import { ZENDESK_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/zendesk/preset";
import type { PresetWebhookUi } from "@app/types/triggers/webhooks_source_preset";

export const ZENDESK_WEBHOOK_PRESET_UI: PresetWebhookUi<"zendesk"> = {
  ...ZENDESK_WEBHOOK_PRESET,
  components: {
    detailsComponent: WebhookSourceZendeskDetails,
    createFormComponent: CreateWebhookZendeskConnection,
    oauthExtraConfigInput: ZendeskOAuthExtraConfig,
  },
};
