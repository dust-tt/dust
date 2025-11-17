import type { JSONSchema7 as JSONSchema } from "json-schema";

export const ticketPriorityChangedSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    type: {
      type: "string",
      description: "The event type",
      const: "zen:event-type:ticket.priority_changed",
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
      description: "Event-specific data about the priority change",
      properties: {
        current: {
          type: "string",
          description: "The current priority",
          enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        },
        previous: {
          type: "string",
          description: "The previous priority",
          enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        },
      },
    },
    detail: {
      type: "object",
      description: "Details about the ticket",
      properties: {
        actor_id: {
          type: "string",
          description: "The ID of the user who performed the action",
        },
        assignee_id: {
          type: "string",
          description: "The assignee ID",
        },
        brand_id: {
          type: "string",
          description: "The brand ID",
        },
        created_at: {
          type: "string",
          description: "When the ticket was created",
        },
        custom_status: {
          type: "string",
          description: "The custom status ID",
        },
        description: {
          type: "string",
          description: "The ticket description",
        },
        external_id: {
          type: ["string", "null"],
          description: "The external ID",
        },
        form_id: {
          type: "string",
          description: "The form ID",
        },
        group_id: {
          type: "string",
          description: "The group ID",
        },
        id: {
          type: "string",
          description: "The ticket ID",
        },
        is_public: {
          type: "boolean",
          description: "Whether the ticket is public",
        },
        organization_id: {
          type: ["string", "null"],
          description: "The organization ID",
        },
        priority: {
          type: "string",
          description: "The ticket priority",
          enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        },
        requester_id: {
          type: "string",
          description: "The requester ID",
        },
        status: {
          type: "string",
          description: "The ticket status",
          enum: [
            "NEW",
            "OPEN",
            "PENDING",
            "HOLD",
            "SOLVED",
            "CLOSED",
            "DELETED",
            "ARCHIVED",
            "SCRUBBED",
          ],
        },
        subject: {
          type: "string",
          description: "The ticket subject",
        },
        submitter_id: {
          type: "string",
          description: "The submitter ID",
        },
        tags: {
          type: "array",
          description: "Tags associated with the ticket",
          items: {
            type: "string",
          },
        },
        type: {
          type: "string",
          description: "The ticket type",
          enum: ["PROBLEM", "INCIDENT", "QUESTION", "TASK"],
        },
        updated_at: {
          type: "string",
          description: "When the ticket was last updated",
        },
        via: {
          type: "object",
          description: "Information about how the ticket was submitted",
          properties: {
            channel: {
              type: "string",
              description: "The channel through which the ticket was submitted",
            },
          },
        },
      },
    },
  },
};

export const ticketPriorityChangedExample = {
  account_id: 22129848,
  detail: {
    id: "5158",
    subject: "Cannot login to mobile app",
    status: "OPEN",
    priority: "URGENT",
    created_at: "2025-01-08T10:12:07Z",
    updated_at: "2025-01-08T11:30:15Z",
  },
  event: {
    current: "URGENT",
    previous: "HIGH",
  },
  id: "b7c8d9e0-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
  subject: "zen:ticket:5158",
  time: "2025-01-08T11:30:15.456789012Z",
  type: "zen:event-type:ticket.priority_changed",
  zendesk_event_version: "2022-11-06",
};
