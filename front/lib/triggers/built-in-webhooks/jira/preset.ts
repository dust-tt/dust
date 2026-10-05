import type {
  WebhookEventMetadata,
  WebhookPresetMetadata,
} from "@app/types/triggers/webhooks_source_preset";

const JIRA_ISSUE_CREATED_EVENT = {
  name: "issue_created",
  value: "jira:issue_created" as const,
  description:
    "Triggered when a new issue is created in Jira. The event includes details about the issue, creator, and project.",
} satisfies WebhookEventMetadata;

const JIRA_ISSUE_UPDATED_EVENT = {
  name: "issue_updated",
  value: "jira:issue_updated" as const,
  description:
    "Triggered when an existing issue is updated in Jira. The event includes details about the changes made to the issue.",
} satisfies WebhookEventMetadata;

const JIRA_ISSUE_DELETED_EVENT = {
  name: "issue_deleted",
  value: "jira:issue_deleted" as const,
  description:
    "Triggered when an issue is deleted in Jira. The event includes details about the deleted issue and the user who performed the deletion.",
} satisfies WebhookEventMetadata;

export const JIRA_WEBHOOK_METADATA = {
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
  description: "Receive events from Jira such as creation of issues.",
  webhookPageUrl: `https://id.atlassian.com/manage-profile/security/api-tokens`,
} satisfies WebhookPresetMetadata;
