import { CreateWebhookJiraConnection } from "@app/lib/triggers/built-in-webhooks/jira/components/CreateWebhookJiraConnection";
import { WebhookSourceJiraDetails } from "@app/lib/triggers/built-in-webhooks/jira/components/WebhookSourceJiraDetails";
import {
  issueCreatedExample,
  issueCreatedSchema,
} from "@app/lib/triggers/built-in-webhooks/jira/schemas/issue_created";
import { issueDeletedSchema } from "@app/lib/triggers/built-in-webhooks/jira/schemas/issue_deleted";
import { issueUpdatedSchema } from "@app/lib/triggers/built-in-webhooks/jira/schemas/issue_updated";
import { JiraWebhookService } from "@app/lib/triggers/built-in-webhooks/jira/service";
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
  sample: issueCreatedExample,
};

const JIRA_ISSUE_UPDATED_EVENT: WebhookEvent = {
  name: "issue_updated",
  value: "jira:issue_updated",
  description:
    "Triggered when an existing issue is updated in Jira. The event includes details about the changes made to the issue.",
  schema: issueUpdatedSchema,
  sample: null,
};

const JIRA_ISSUE_DELETED_EVENT: WebhookEvent = {
  name: "issue_deleted",
  value: "jira:issue_deleted",
  description:
    "Triggered when an issue is deleted in Jira. The event includes details about the deleted issue and the user who performed the deletion.",
  schema: issueDeletedSchema,
  sample: null,
};

export const JIRA_WEBHOOK_PRESET: PresetWebhook<"jira"> = {
  name: "Jira",
  eventCheck: {
    type: "body",
    field: "webhookEvent",
  },
  events: [
    JIRA_ISSUE_CREATED_EVENT,
    JIRA_ISSUE_UPDATED_EVENT,
    JIRA_ISSUE_DELETED_EVENT,
  ],
  icon: "JiraLogo",
  description: "Receive events from Jira such as creation of issues.",
  filterGenerationInstructions: null,
  webhookPageUrl: `https://id.atlassian.com/manage-profile/security/api-tokens`,
  webhookService: new JiraWebhookService(),
  components: {
    detailsComponent: WebhookSourceJiraDetails,
    createFormComponent: CreateWebhookJiraConnection,
  },
};
