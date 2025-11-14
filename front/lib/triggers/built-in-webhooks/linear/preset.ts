import { CreateWebhookLinearConnection } from "@app/lib/triggers/built-in-webhooks/linear/components/CreateWebhookLinearConnection";
import { WebhookSourceLinearDetails } from "@app/lib/triggers/built-in-webhooks/linear/components/WebhookSourceLinearDetails";
import {
  lambdaExample,
  lambdaSchema,
} from "@app/lib/triggers/built-in-webhooks/linear/schemas/lambda";
import { LinearWebhookService } from "@app/lib/triggers/built-in-webhooks/linear/service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const LINEAR_LAMBDA_EVENT: WebhookEvent = {
  name: "lambda",
  value: "lambda",
  description: "Lambda event for Linear webhooks",
  schema: lambdaSchema,
  sample: lambdaExample,
};

export const LINEAR_WEBHOOK_PRESET: PresetWebhook<"linear"> = {
  name: "Linear",
  eventCheck: {
    type: "headers",
    field: "Linear-Event",
  },
  events: [LINEAR_LAMBDA_EVENT],
  icon: "LinearLogo",
  description: "Receive events from Linear.",
  webhookPageUrl: "https://linear.app/settings/api",
  webhookService: new LinearWebhookService(),
  components: {
    detailsComponent: WebhookSourceLinearDetails,
    createFormComponent: CreateWebhookLinearConnection,
  },
};
