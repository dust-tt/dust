import { CreateWebhookJiraConnection } from "@app/lib/triggers/built-in-webhooks/jira/components/CreateWebhookJiraConnection";
import { WebhookSourceJiraDetails } from "@app/lib/triggers/built-in-webhooks/jira/components/WebhookSourceJiraDetails";
import { JIRA_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import type { ClientSideWebhookPreset } from "@app/lib/triggers/webhooks_client_side";

export const JIRA_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...JIRA_WEBHOOK_PRESET,
  icon: "JiraLogo",
  components: {
    detailsComponent: WebhookSourceJiraDetails,
    createFormComponent: CreateWebhookJiraConnection,
  },
};
