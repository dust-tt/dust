import type { JSONSchema7 as JSONSchema } from "json-schema";

export const ticketCommentAddedSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    type: {
      type: "string",
      description: "The event type",
      const: "zen:event-type:ticket.comment_added",
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
      description: "Event-specific data about the comment",
      properties: {
        comment: {
          type: "object",
          description: "The comment that was added",
          properties: {
            id: {
              type: "string",
              description: "The comment ID",
            },
            body: {
              type: "string",
              description: "The comment body text",
            },
            is_public: {
              type: "boolean",
              description: "Whether the comment is public or private",
            },
            author: {
              type: "object",
              description: "The author of the comment",
              properties: {
                id: {
                  type: "string",
                  description: "The author's user ID",
                },
                is_staff: {
                  type: "boolean",
                  description: "Whether the author is a staff member",
                },
                name: {
                  type: "string",
                  description: "The author's name",
                },
              },
            },
          },
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
