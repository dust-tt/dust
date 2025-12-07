import { CreateWebhookGithubConnection } from "@app/lib/triggers/built-in-webhooks/github/components/CreateWebhookGithubConnection";
import { WebhookSourceGithubDetails } from "@app/lib/triggers/built-in-webhooks/github/components/WebhookSourceGithubDetails";
import {
  issueExample,
  issueSchema,
} from "@app/lib/triggers/built-in-webhooks/github/schemas/issues";
import {
  pullRequestExample,
  pullRequestSchema,
} from "@app/lib/triggers/built-in-webhooks/github/schemas/pull_request";
import {
  prReviewExample,
  prReviewSchema,
} from "@app/lib/triggers/built-in-webhooks/github/schemas/pull_request_review";
import {
  pushExample,
  pushSchema,
} from "@app/lib/triggers/built-in-webhooks/github/schemas/push";
import {
  releaseExample,
  releaseSchema,
} from "@app/lib/triggers/built-in-webhooks/github/schemas/release";
import { GitHubWebhookService } from "@app/lib/triggers/built-in-webhooks/github/service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const GITHUB_PULL_REQUEST_EVENT: WebhookEvent = {
  name: "pull_request",
  value: "pull_request",
  description:
    "Activity related to pull requests. The type of activity is specified in the `action` property of the payload object.",
  schema: pullRequestSchema,
  sample: pullRequestExample,
};

const GITHUB_ISSUES_EVENT: WebhookEvent = {
  name: "issues",
  value: "issues",
  description:
    "Activity related to an issue. The type of activity is specified in the `action` property of the payload object.",
  schema: issueSchema,
  sample: issueExample,
};

const GITHUB_PULL_REQUEST_REVIEW_EVENT: WebhookEvent = {
  name: "pull_request_review",
  value: "pull_request_review",
  description:
    "Activity related to a pull request review. The type of activity is specified in the `action` property of the payload object.",
  schema: prReviewSchema,
  sample: prReviewExample,
};

const GITHUB_PUSH_EVENT: WebhookEvent = {
  name: "push",
  value: "push",
  description: "Activity related to code pushes.",
  schema: pushSchema,
  sample: pushExample,
};

const GITHUB_RELEASE_EVENT: WebhookEvent = {
  name: "release",
  value: "release",
  description:
    "Activity related to a release. The type of activity is specified in the `action` property of the payload object.",
  schema: releaseSchema,
  sample: releaseExample,
};

export const GITHUB_WEBHOOK_PRESET: PresetWebhook<"github"> = {
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
  ],
  event_blacklist: ["ping"],
  icon: "GithubLogo",
  description:
    "Receive events from GitHub such as creation or edition of issues or pull requests.",
  webhookPageUrl: `https://github.com/settings/connections/applications/${process.env.NEXT_PUBLIC_OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID}`,
  webhookService: new GitHubWebhookService(),
  components: {
    detailsComponent: WebhookSourceGithubDetails,
    createFormComponent: CreateWebhookGithubConnection,
  },
};
