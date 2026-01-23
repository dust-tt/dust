import { CreateWebhookLinearConnection } from "@app/lib/triggers/built-in-webhooks/linear/components/CreateWebhookLinearConnection";
import { WebhookSourceLinearDetails } from "@app/lib/triggers/built-in-webhooks/linear/components/WebhookSourceLinearDetails";
import { issueSchema } from "@app/lib/triggers/built-in-webhooks/linear/schemas/issue";
import { projectSchema } from "@app/lib/triggers/built-in-webhooks/linear/schemas/project";
import { LinearWebhookService } from "@app/lib/triggers/built-in-webhooks/linear/service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const LINEAR_ISSUE_EVENT: WebhookEvent = {
  name: "issue",
  value: "Issue",
  description: "Lambda event for Linear webhooks",
  schema: issueSchema,
  sample: null,
};

const LINEAR_PROJECT_EVENT: WebhookEvent = {
  name: "project",
  value: "Project",
  description: "Lambda event for Linear webhooks",
  schema: projectSchema,
  sample: null,
};

export const LINEAR_WEBHOOK_PRESET: PresetWebhook<"linear"> = {
  name: "Linear",
  eventCheck: {
    type: "headers",
    field: "Linear-Event",
  },
  events: [LINEAR_ISSUE_EVENT, LINEAR_PROJECT_EVENT],
  icon: "LinearLogo",
  description: "Receive events from Linear.",
  filterGenerationInstructions: null,
  webhookPageUrl: "https://linear.app/settings/api",
  webhookService: new LinearWebhookService(),
  components: {
    detailsComponent: WebhookSourceLinearDetails,
    createFormComponent: CreateWebhookLinearConnection,
  },
};
