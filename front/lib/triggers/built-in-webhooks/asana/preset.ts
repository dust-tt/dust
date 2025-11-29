import { CreateWebhookAsanaConnection } from "@app/lib/triggers/built-in-webhooks/asana/components/CreateWebhookAsanaConnection";
import { WebhookSourceAsanaDetails } from "@app/lib/triggers/built-in-webhooks/asana/components/WebhookSourceAsanaDetails";
import {
  taskEventExample,
  taskEventSchema,
} from "@app/lib/triggers/built-in-webhooks/asana/schemas/task";
import { AsanaWebhookService } from "@app/lib/triggers/built-in-webhooks/asana/service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const ASANA_TASK_EVENT: WebhookEvent = {
  name: "task",
  value: "task",
  description:
    "Triggered when a task is created, updated, deleted, removed from project, or restored",
  schema: taskEventSchema,
  sample: taskEventExample,
};

export const ASANA_WEBHOOK_PRESET: PresetWebhook<"asana"> = {
  name: "Asana",
  eventCheck: {
    type: "body",
    field: "events",
  },
  events: [ASANA_TASK_EVENT],
  icon: "AsanaLogo",
  description: "Receive events when tasks change in Asana projects.",
  webhookPageUrl: "https://developers.asana.com/docs/webhooks-guide",
  webhookService: new AsanaWebhookService(),
  components: {
    detailsComponent: WebhookSourceAsanaDetails,
    createFormComponent: CreateWebhookAsanaConnection,
  },
  featureFlag: "dev_webhooks",
};
