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

export const ticketCommentAddedExample = {
  account_id: 22129848,
  detail: {
    id: "5158",
    subject: "Cannot login to mobile app",
    status: "OPEN",
    priority: "HIGH",
    created_at: "2025-01-08T10:12:07Z",
    updated_at: "2025-01-08T14:25:30Z",
  },
  event: {
    comment: {
      id: 9876543210,
      body: "We are investigating this issue and will update you shortly.",
      is_public: true,
      author: {
        id: 8447388090495,
        is_staff: true,
        name: "Support Agent",
      },
    },
  },
  id: "d4f5c389-8f4a-4c2e-a1b9-8e4f39c71d52",
  subject: "zen:ticket:5158",
  time: "2025-01-08T14:25:30.123456789Z",
  type: "zen:event-type:ticket.comment_added",
  zendesk_event_version: "2022-11-06",
};
