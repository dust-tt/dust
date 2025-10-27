import { ZendeskLogo } from "@dust-tt/sparkle";

import { ZendeskOAuthExtraConfig } from "@app/components/data_source/ZendeskOAuthExtraConfig";
import { CreateWebhookZendeskConnection } from "@app/lib/triggers/built-in-webhooks/zendesk/components/CreateWebhookZendeskConnection";
import { WebhookSourceZendeskDetails } from "@app/lib/triggers/built-in-webhooks/zendesk/components/WebhookSourceZendeskDetails";
import { ZENDESK_WEBHOOK_EVENTS } from "@app/lib/triggers/built-in-webhooks/zendesk/zendesk_webhook_events";
import { ZendeskWebhookService } from "@app/lib/triggers/built-in-webhooks/zendesk/zendesk_webhook_service";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";

export const ZENDESK_WEBHOOK_PRESET: PresetWebhook<"zendesk"> = {
  name: "Zendesk",
  eventCheck: {
    type: "body",
    field: "type",
  },
  events: ZENDESK_WEBHOOK_EVENTS,
  icon: ZendeskLogo,
  description:
    "Receive events from Zendesk such as ticket creation or modification",
  featureFlag: "hootl_dev_webhooks",
  webhookService: new ZendeskWebhookService(),
  components: {
    detailsComponent: WebhookSourceZendeskDetails,
    createFormComponent: CreateWebhookZendeskConnection,
    oauthExtraConfigInput: ZendeskOAuthExtraConfig,
  },
};
