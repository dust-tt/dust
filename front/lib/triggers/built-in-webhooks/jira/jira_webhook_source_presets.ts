import { CreateWebhookJiraConnection } from "@app/lib/triggers/built-in-webhooks/jira/components/CreateWebhookJiraConnection";
import { WebhookSourceJiraDetails } from "@app/lib/triggers/built-in-webhooks/jira/components/WebhookSourceJiraDetails";
import { JiraWebhookService } from "@app/lib/triggers/built-in-webhooks/jira/jira_webhook_service";
import { issueCreatedSchema } from "@app/lib/triggers/built-in-webhooks/jira/schemas/json_schema_issue_created";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const JIRA_ISSUE_CREATED_EVENT: WebhookEvent = {
  name: "issue_created",
  value: "jira:issue_created",
  description:
    "Triggered when a new issue is created in Jira. The event includes details about the issue, creator, and project.",
  schema: issueCreatedSchema,
};

export const JIRA_WEBHOOK_PRESET: PresetWebhook<"jira"> = {
  name: "Jira",
  eventCheck: {
    type: "body",
    field: "issue_event_type_name",
  },
  events: [JIRA_ISSUE_CREATED_EVENT],
  icon: "JiraLogo",
  description: "Receive events from Jira such as creation of issues.",
  webhookPageUrl: `https://id.atlassian.com/manage-profile/security/api-tokens`,
  featureFlag: "hootl_dev_webhooks",
  webhookService: new JiraWebhookService(),
  components: {
    detailsComponent: WebhookSourceJiraDetails,
    createFormComponent: CreateWebhookJiraConnection,
  },
};
