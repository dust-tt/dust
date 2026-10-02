import type { JSONSchema7 as JSONSchema } from "json-schema";

// Linear nests the entity under `data`; filters run against the full envelope,
// so the generator schema must model it too (else it emits `labelIds` instead
// of `data.labelIds`). https://linear.app/developers/webhooks#the-webhook-payload
export function makeLinearWebhookEnvelopeSchema({
  entityType,
  dataSchema,
}: {
  entityType: string;
  dataSchema: JSONSchema;
}): JSONSchema {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: `Linear${entityType}WebhookEnvelope`,
    type: "object",
    description: `Payload envelope for a ${entityType} webhook event from Linear. The ${entityType} itself is nested under "data".`,
    required: ["action", "type", "createdAt", "data", "url"],
    properties: {
      action: {
        type: "string",
        description: "The change that triggered the webhook.",
        enum: ["create", "update", "remove"],
      },
      type: {
        type: "string",
        description: "The type of entity carried in `data`.",
        enum: [entityType],
      },
      createdAt: {
        type: "string",
        description: "When the webhook event was created.",
      },
      data: dataSchema,
      updatedFrom: {
        type: ["object", "null"],
        description:
          "Previous values of the fields that changed (present on `update` events only).",
      },
      url: {
        type: "string",
        description: "URL to the entity in Linear.",
      },
      organizationId: {
        type: ["string", "null"],
        description: "ID of the Linear organization.",
      },
      webhookTimestamp: {
        type: ["number", "null"],
        description: "Timestamp at which the webhook was sent.",
      },
      webhookId: {
        type: ["string", "null"],
        description: "ID of the webhook that delivered this event.",
      },
    },
  };
}
