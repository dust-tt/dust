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
          type: "integer",
          description: "The ID of the user who performed the action",
        },
        id: {
          type: "integer",
          description: "The ticket ID",
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
        description: {
          type: "string",
          description: "The ticket description",
        },
        created_at: {
          type: "string",
          description: "When the ticket was created",
        },
        updated_at: {
          type: "string",
          description: "When the ticket was last updated",
        },
        priority: {
          type: "string",
          description: "The ticket priority",
          enum: ["low", "normal", "high", "urgent"],
        },
        type: {
          type: "string",
          description: "The ticket type",
          enum: ["problem", "incident", "question", "task"],
        },
        tags: {
          type: "array",
          description: "Tags associated with the ticket",
          items: {
            type: "string",
          },
        },
        organization_id: {
          type: "integer",
          description: "The organization ID",
        },
        assignee_id: {
          type: "integer",
          description: "The assignee ID",
        },
        group_id: {
          type: "integer",
          description: "The group ID",
        },
        requester_id: {
          type: "integer",
          description: "The requester ID",
        },
      },
    },
  },
};
