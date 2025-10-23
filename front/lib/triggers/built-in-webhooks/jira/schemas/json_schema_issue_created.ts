import type { JSONSchema7 as JSONSchema } from "json-schema";

export const issueCreatedSchema: JSONSchema = {
  type: "object",
  properties: {
    timestamp: {
      type: "integer",
      description: "The timestamp when the event occurred",
    },
    webhookEvent: {
      type: "string",
      description: "The type of event (e.g., jira:issue_created)",
    },
    issue: {
      type: "object",
      description: "The issue that was created",
      properties: {
        id: { type: "string" },
        key: { type: "string" },
        fields: {
          type: "object",
          properties: {
            summary: { type: "string" },
            description: { type: ["string", "null"] },
            issuetype: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
            },
            project: {
              type: "object",
              properties: {
                key: { type: "string" },
                name: { type: "string" },
              },
            },
            status: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
            },
            assignee: {
              type: ["object", "null"],
              properties: {
                displayName: { type: "string" },
                emailAddress: { type: "string" },
              },
            },
            reporter: {
              type: "object",
              properties: {
                displayName: { type: "string" },
                emailAddress: { type: "string" },
              },
            },
            created: { type: "string" },
            updated: { type: "string" },
          },
        },
      },
    },
    user: {
      type: "object",
      description: "The user who triggered the event",
      properties: {
        displayName: { type: "string" },
        emailAddress: { type: "string" },
      },
    },
  },
  required: ["timestamp", "webhookEvent", "issue"],
  additionalProperties: true,
};
