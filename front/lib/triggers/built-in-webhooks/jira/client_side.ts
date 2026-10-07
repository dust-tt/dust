import { CreateWebhookJiraConnection } from "@app/lib/triggers/built-in-webhooks/jira/components/CreateWebhookJiraConnection";
import { WebhookSourceJiraDetails } from "@app/lib/triggers/built-in-webhooks/jira/components/WebhookSourceJiraDetails";
import { JIRA_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import type { ClientSideWebhookPreset } from "@app/lib/triggers/webhooks_client_side";
import { msg } from "@lingui/core/macro";

export const JIRA_CLIENT_SIDE_WEBHOOK_PRESET: ClientSideWebhookPreset = {
  ...JIRA_WEBHOOK_METADATA,
  description: msg`Receive events from Jira such as creation of issues.`,
  icon: "JiraLogo",
  components: {
    detailsComponent: WebhookSourceJiraDetails,
    createFormComponent: CreateWebhookJiraConnection,
  },
};
