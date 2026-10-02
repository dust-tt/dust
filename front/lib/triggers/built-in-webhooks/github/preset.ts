import type {
  WebhookEventMetadata,
  WebhookPresetMetadata,
} from "@app/types/triggers/webhooks_source_preset";

const GITHUB_PULL_REQUEST_EVENT = {
  name: "pull_request",
  value: "pull_request" as const,
  description:
    "Activity related to pull requests. The type of activity is specified in the `action` property of the payload object.",
} satisfies WebhookEventMetadata;

const GITHUB_ISSUES_EVENT = {
  name: "issues",
  value: "issues" as const,
  description:
    "Activity related to an issue. The type of activity is specified in the `action` property of the payload object.",
} satisfies WebhookEventMetadata;

const GITHUB_PULL_REQUEST_REVIEW_EVENT = {
  name: "pull_request_review",
  value: "pull_request_review" as const,
  description:
    "Activity related to a pull request review. The type of activity is specified in the `action` property of the payload object.",
} satisfies WebhookEventMetadata;

const GITHUB_PUSH_EVENT = {
  name: "push",
  value: "push" as const,
  description: "Activity related to code pushes.",
} satisfies WebhookEventMetadata;

const GITHUB_PROJECTS_V2_ITEM_EVENT = {
  name: "projects_v2_item (organizations only)",
  value: "projects_v2_item" as const,
  description:
    "Activity related to an item on an organization-level project. Only available for organization webhooks, not repository webhooks. The type of activity is specified in the `action` property of the payload object.",
} satisfies WebhookEventMetadata;

const GITHUB_RELEASE_EVENT = {
  name: "release",
  value: "release" as const,
  description:
    "Activity related to a release. The type of activity is specified in the `action` property of the payload object.",
} satisfies WebhookEventMetadata;

export const GITHUB_WEBHOOK_METADATA = {
  name: "GitHub",
  eventCheck: {
    type: "headers",
    field: "X-GitHub-Event",
  },
  events: [
    GITHUB_PULL_REQUEST_EVENT,
    GITHUB_ISSUES_EVENT,
    GITHUB_PULL_REQUEST_REVIEW_EVENT,
    GITHUB_PUSH_EVENT,
    GITHUB_RELEASE_EVENT,
    GITHUB_PROJECTS_V2_ITEM_EVENT,
  ],
  event_blacklist: ["ping"],
  description:
    "Receive events from GitHub such as creation or edition of issues or pull requests.",
  webhookPageUrl: `https://github.com/settings/connections/applications/${process.env.NEXT_PUBLIC_OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID}`,
} satisfies WebhookPresetMetadata;
