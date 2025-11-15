import type { JSONSchema7 as JSONSchema } from "json-schema";

export const issueDeletedSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema",
  type: "object",
  title: "jira:issue_deleted event",
  required: [
    "timestamp",
    "webhookEvent",
    "issue_event_type_name",
    "user",
    "issue",
  ],
  properties: {
    timestamp: {
      type: "integer",
      description: "UTC milliseconds from epoch",
    },
    webhookEvent: {
      type: "string",
      const: "jira:issue_deleted",
      description: "The webhook event identifier",
    },
    issue_event_type_name: {
      type: "string",
      description:
        "The Jira event type that triggered this webhook (e.g., 'issue_deleted')",
    },
    user: {
      type: "object",
      description: "The user who triggered the event",
      required: [
        "self",
        "accountId",
        "displayName",
        "active",
        "timeZone",
        "accountType",
      ],
      properties: {
        self: {
          type: "string",
          format: "uri",
        },
        accountId: {
          type: "string",
        },
        displayName: {
          type: "string",
        },
        emailAddress: {
          type: "string",
          format: "email",
        },
        avatarUrls: {
          type: "object",
          properties: {
            "16x16": { type: "string", format: "uri" },
            "24x24": { type: "string", format: "uri" },
            "32x32": { type: "string", format: "uri" },
            "48x48": { type: "string", format: "uri" },
          },
        },
        active: {
          type: "boolean",
        },
        timeZone: {
          type: "string",
        },
        accountType: {
          type: "string",
          enum: ["atlassian", "app", "customer"],
          description: "Type of user account",
        },
      },
    },
    issue: {
      type: "object",
      description: "The Jira issue that was created",
      properties: {
        id: {
          type: "string",
          description: "Unique identifier of the issue",
        },
        self: {
          type: "string",
          description: "URL of the issue",
        },
        key: {
          type: "string",
          description: "Issue key (e.g., PROJECT-123)",
        },
        fields: {
          type: "object",
          description: "Issue fields",
          properties: {
            summary: {
              type: "string",
              description: "Summary/title of the issue",
            },
            description: {
              type: ["string", "object", "null"],
              description: "Description of the issue",
            },
            created: {
              type: "string",
              description: "ISO 8601 timestamp when issue was created",
            },
            updated: {
              type: "string",
              description: "ISO 8601 timestamp when issue was last updated",
            },
            status: {
              type: "object",
              description: "Current status of the issue",
              properties: {
                self: { type: "string" },
                description: { type: "string" },
                name: { type: "string" },
                id: { type: "string" },
                statusCategory: {
                  type: "object",
                  properties: {
                    self: { type: "string" },
                    id: { type: "integer" },
                    key: { type: "string" },
                    name: { type: "string" },
                  },
                },
              },
            },
            priority: {
              type: "object",
              description: "Priority of the issue",
              properties: {
                self: { type: "string" },
                name: { type: "string" },
                id: { type: "string" },
              },
            },
            issuetype: {
              type: "object",
              description: "Type of the issue",
              properties: {
                self: { type: "string" },
                id: { type: "string" },
                description: { type: "string" },
                name: { type: "string" },
                subtask: { type: "boolean" },
              },
            },
            project: {
              type: "object",
              description: "Project the issue belongs to",
              properties: {
                self: { type: "string" },
                id: { type: "string" },
                key: { type: "string" },
                name: { type: "string" },
              },
            },
            creator: {
              type: "object",
              description: "User who created the issue",
              properties: {
                self: { type: "string" },
                accountId: { type: "string" },
                displayName: { type: "string" },
                active: { type: "boolean" },
              },
            },
            reporter: {
              type: "object",
              description: "User who reported the issue",
              properties: {
                self: { type: "string" },
                accountId: { type: "string" },
                displayName: { type: "string" },
                active: { type: "boolean" },
              },
            },
            assignee: {
              type: ["object", "null"],
              description: "User assigned to the issue",
              properties: {
                self: { type: "string" },
                accountId: { type: "string" },
                displayName: { type: "string" },
                active: { type: "boolean" },
              },
            },
            labels: {
              type: "array",
              description: "Labels attached to the issue",
              items: {
                type: "string",
              },
            },
          },
        },
      },
      required: ["id", "key", "fields"],
    },
    matchedWebhookIds: {
      type: "array",
      items: {
        type: "integer",
      },
      description:
        "IDs of webhooks that matched this event (for REST API registered webhooks)",
    },
  },
};
