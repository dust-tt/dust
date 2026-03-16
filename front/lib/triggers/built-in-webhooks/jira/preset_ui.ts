import { CreateWebhookJiraConnection } from "@app/lib/triggers/built-in-webhooks/jira/components/CreateWebhookJiraConnection";
import { WebhookSourceJiraDetails } from "@app/lib/triggers/built-in-webhooks/jira/components/WebhookSourceJiraDetails";
import { JIRA_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import type { PresetWebhookUi } from "@app/types/triggers/webhooks_source_preset";

export const JIRA_WEBHOOK_PRESET_UI: PresetWebhookUi<"jira"> = {
  ...JIRA_WEBHOOK_PRESET,
  components: {
    detailsComponent: WebhookSourceJiraDetails,
    createFormComponent: CreateWebhookJiraConnection,
  },
};
