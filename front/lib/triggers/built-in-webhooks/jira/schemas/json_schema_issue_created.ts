import type { JSONSchema7 as JSONSchema } from "json-schema";

export const issueCreatedSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    timestamp: {
      type: "integer",
      description:
        "Time when the webhook was triggered (UTC milliseconds from epoch)",
    },
    webhookEvent: {
      type: "string",
      description: "The type of webhook event",
      enum: ["jira:issue_created"],
    },
    user: {
      type: "object",
      description: "User who triggered the event",
      properties: {
        self: {
          type: "string",
          description: "URL of the user",
        },
        accountId: {
          type: "string",
          description: "Account ID of the user",
        },
        displayName: {
          type: "string",
          description: "Display name of the user",
        },
        emailAddress: {
          type: "string",
          description: "Email address of the user",
        },
        active: {
          type: "boolean",
          description: "Whether the user is active",
        },
        timeZone: {
          type: "string",
          description: "User's time zone",
        },
        accountType: {
          type: "string",
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
  },
  required: ["timestamp", "webhookEvent", "issue"],
};
