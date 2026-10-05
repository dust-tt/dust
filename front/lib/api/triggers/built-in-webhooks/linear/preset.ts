import { makeLinearWebhookEnvelopeSchema } from "@app/lib/api/triggers/built-in-webhooks/linear/schemas/envelope";
import { issueSchema } from "@app/lib/api/triggers/built-in-webhooks/linear/schemas/issue";
import { projectSchema } from "@app/lib/api/triggers/built-in-webhooks/linear/schemas/project";
import { LINEAR_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import type {
  BaseWebhookPreset,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const eventPayloads = {
  Issue: {
    schema: makeLinearWebhookEnvelopeSchema({
      entityType: "Issue",
      dataSchema: issueSchema,
    }),
    sample: null,
  },
  Project: {
    schema: makeLinearWebhookEnvelopeSchema({
      entityType: "Project",
      dataSchema: projectSchema,
    }),
    sample: null,
  },
} satisfies Record<
  (typeof LINEAR_WEBHOOK_METADATA.events)[number]["value"],
  Pick<WebhookEvent, "schema" | "sample">
>;

export const LINEAR_WEBHOOK_PRESET: BaseWebhookPreset = {
  ...LINEAR_WEBHOOK_METADATA,
  events: LINEAR_WEBHOOK_METADATA.events.map((event) => ({
    ...event,
    ...eventPayloads[event.value],
  })),
  filterGenerationInstructions: null,
};
