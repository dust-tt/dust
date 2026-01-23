import type { JSONSchema7 as JSONSchema } from "json-schema";

export const userCreatedSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    type: {
      type: "string",
      description: "The event type",
      const: "zen:event-type:user.created",
    },
    account_id: {
      type: "integer",
      description: "The Zendesk account ID",
    },
    id: {
      type: "string",
      description: "The unique event ID",
    },
    time: {
      type: "string",
      description: "The time the event occurred in ISO 8601 format",
    },
    zendesk_event_version: {
      type: "string",
      description: "The version of the Zendesk event schema",
    },
    subject: {
      type: "string",
      description: "The subject of the event",
    },
    event: {
      type: "object",
      description: "Event-specific data (empty for user.created events)",
      properties: {},
    },
    detail: {
      type: "object",
      description: "Details about the user",
      properties: {
        created_at: {
          type: "string",
          description: "When the user was created",
        },
        email: {
          type: "string",
          description: "The user's email address",
        },
        external_id: {
          type: "string",
          description: "The external ID of the user",
        },
        default_group_id: {
          type: "string",
          description: "The default group ID (returned as string)",
        },
        id: {
          type: "string",
          description: "The user ID (returned as string)",
        },
        organization_id: {
          type: "string",
          description: "The organization ID (returned as string)",
        },
        role: {
          type: "string",
          description: "The user's role",
        },
        updated_at: {
          type: "string",
          description: "When the user was last updated",
        },
      },
    },
  },
};

export const userCreatedExample = {
  type: "zen:event-type:user.created",
  account_id: 12514403,
  id: "6b9bbadf-5725-4e92-bebe-7b71011bf5f1",
  subject: "zen:user:6596848315901",
  time: "2025-01-08T05:33:18Z",
  zendesk_event_version: "2022-06-20",
  detail: {
    created_at: "2025-01-08T05:27:58Z",
    email: "[email protected]",
    external_id: "",
    default_group_id: "0",
    id: "6596848315901",
    organization_id: "0",
    role: "end-user",
    updated_at: "2025-01-08T05:33:18Z",
  },
  event: {},
};
