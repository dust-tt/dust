import type { JSONSchema7 as JSONSchema } from "json-schema";

export const organizationCreatedSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    type: {
      type: "string",
      description: "The event type",
      const: "zen:event-type:organization.created",
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
      description:
        "Event-specific data (empty for organization.created events)",
      properties: {},
    },
    detail: {
      type: "object",
      description: "Details about the organization",
      properties: {
        created_at: {
          type: "string",
          description: "When the organization was created",
        },
        external_id: {
          type: "string",
          description: "The external ID of the organization",
        },
        group_id: {
          type: "string",
          description: "The group ID (returned as string)",
        },
        id: {
          type: "string",
          description: "The organization ID (returned as string)",
        },
        name: {
          type: "string",
          description: "The organization name",
        },
        shared_comments: {
          type: "boolean",
          description: "Whether comments are shared within the organization",
        },
        shared_tickets: {
          type: "boolean",
          description: "Whether tickets are shared within the organization",
        },
        updated_at: {
          type: "string",
          description: "When the organization was last updated",
        },
      },
    },
  },
};
