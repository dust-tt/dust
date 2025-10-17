import { GithubLogo } from "@dust-tt/sparkle";

import { CreateWebhookGithubConnection } from "@app/components/triggers/CreateWebhookGithubConnection";
import { WebhookSourceGithubDetails } from "@app/components/triggers/WebhookSourceGithubDetails";
import { GitHubWebhookService } from "@app/lib/triggers/services/github_webhook_service";
import issuesSchema from "@app/types/triggers/github/json_schema_issues.json";
import prSchema from "@app/types/triggers/github/json_schema_pr.json";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const GITHUB_PULL_REQUEST_EVENT: WebhookEvent = {
  name: "pull_request",
  value: "pull_request",
  description:
    "Activity related to pull requests. The type of activity is specified in the `action` property of the payload object.",
  schema: prSchema,
};

const GITHUB_ISSUES_EVENT: WebhookEvent = {
  name: "issues",
  value: "issues",
  description:
    "Activity related to an issue. The type of activity is specified in the `action` property of the payload object.",
  schema: issuesSchema,
};

export const GITHUB_WEBHOOK_PRESET: PresetWebhook = {
  name: "GitHub",
  eventCheck: {
    type: "headers",
    field: "X-GitHub-Event",
  },
  events: [GITHUB_PULL_REQUEST_EVENT, GITHUB_ISSUES_EVENT],
  icon: GithubLogo,
  description:
    "Receive events from GitHub such as creation or edition of issues or pull requests.",
  featureFlag: "hootl_dev_webhooks",
  webhookService: new GitHubWebhookService(),
  components: {
    detailsComponent: WebhookSourceGithubDetails,
    createFormComponent: CreateWebhookGithubConnection,
  },
};
