import type {
  WebhookEventMetadata,
  WebhookPresetMetadata,
} from "@app/types/triggers/webhooks_source_preset";

const LINEAR_ISSUE_EVENT = {
  name: "issue",
  value: "Issue" as const,
  description: "Lambda event for Linear webhooks",
} satisfies WebhookEventMetadata;

const LINEAR_PROJECT_EVENT = {
  name: "project",
  value: "Project" as const,
  description: "Lambda event for Linear webhooks",
} satisfies WebhookEventMetadata;

export const LINEAR_WEBHOOK_METADATA = {
  name: "Linear",
  eventCheck: {
    type: "headers",
    field: "Linear-Event",
  },
  events: [LINEAR_ISSUE_EVENT, LINEAR_PROJECT_EVENT],
  description: "Receive events from Linear.",
  webhookPageUrl: "https://linear.app/settings/api",
} satisfies WebhookPresetMetadata;
