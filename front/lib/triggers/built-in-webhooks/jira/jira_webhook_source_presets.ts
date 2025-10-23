import { JiraLogo } from "@dust-tt/sparkle";

import { CreateWebhookJiraConnection } from "@app/lib/triggers/built-in-webhooks/jira/components/CreateWebhookJiraConnection";
import { WebhookSourceJiraDetails } from "@app/lib/triggers/built-in-webhooks/jira/components/WebhookSourceJiraDetails";
import { JiraWebhookService } from "@app/lib/triggers/built-in-webhooks/jira/jira_webhook_service";
import { issueCreatedSchema } from "@app/lib/triggers/built-in-webhooks/jira/schemas/json_schema_issue_created";
import { issueUpdatedSchema } from "@app/lib/triggers/built-in-webhooks/jira/schemas/json_schema_issue_updated";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const JIRA_ISSUE_CREATED_EVENT: WebhookEvent = {
  name: "issue_created",
  value: "jira:issue_created",
  description:
    "Triggered when a new issue is created in Jira. Contains full issue details including fields, reporter, and assignee.",
  schema: issueCreatedSchema,
};

const JIRA_ISSUE_UPDATED_EVENT: WebhookEvent = {
  name: "issue_updated",
  value: "jira:issue_updated",
  description:
    "Triggered when an issue is updated in Jira. Includes the updated fields in the changelog.",
  schema: issueUpdatedSchema,
};

export const JIRA_WEBHOOK_PRESET: PresetWebhook = {
  name: "Jira",
  eventCheck: {
    type: "body",
    field: "webhookEvent",
  },
  events: [JIRA_ISSUE_CREATED_EVENT, JIRA_ISSUE_UPDATED_EVENT],
  icon: JiraLogo,
  description:
    "Receive events from Jira such as creation or updates of issues.",
  featureFlag: "hootl_dev_webhooks", // Use appropriate feature flag
  webhookService: new JiraWebhookService(),
  components: {
    detailsComponent: WebhookSourceJiraDetails,
    createFormComponent: CreateWebhookJiraConnection,
  },
};
