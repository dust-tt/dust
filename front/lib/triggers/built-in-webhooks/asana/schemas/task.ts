import type { JSONSchema7 as JSONSchema } from "json-schema";

export const taskEventSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "AsanaTaskWebhookPayload",
  type: "object",
  description:
    "Payload for a task webhook event from Asana. Events are delivered as an array.",
  required: ["events"],
  properties: {
    events: {
      type: "array",
      description: "Array of events that occurred since the last delivery.",
      items: {
        type: "object",
        required: ["action", "resource", "created_at"],
        properties: {
          action: {
            type: "string",
            enum: ["added", "changed", "deleted", "removed", "undeleted"],
            description:
              "The type of action that triggered the event: added (task created), changed (task modified), deleted (task deleted), removed (task removed from project), undeleted (task restored).",
          },
          resource: {
            type: "object",
            description: "The resource that was affected by the event.",
            required: ["gid", "resource_type"],
            properties: {
              gid: {
                type: "string",
                description: "Globally unique identifier (GID) of the task.",
              },
              resource_type: {
                type: "string",
                description: "The type of resource (task).",
              },
              resource_subtype: {
                type: ["string", "null"],
                description:
                  "The subtype of the resource (default_task, milestone, etc.).",
              },
            },
          },
          parent: {
            type: ["object", "null"],
            description:
              "The parent resource (typically a project) containing the task.",
            properties: {
              gid: {
                type: "string",
                description: "GID of the parent resource.",
              },
              resource_type: {
                type: "string",
                description: "Type of the parent resource.",
              },
            },
          },
          change: {
            type: ["object", "null"],
            description:
              "Details about what changed (only present for changed events).",
            properties: {
              field: {
                type: "string",
                description:
                  "The field that changed (e.g., name, notes, due_on, assignee).",
              },
              action: {
                type: "string",
                description: "The type of change (changed, added, removed).",
              },
              new_value: {
                description: "The new value of the field.",
              },
              added_value: {
                description: "Value that was added (for collection fields).",
              },
              removed_value: {
                description: "Value that was removed (for collection fields).",
              },
            },
          },
          user: {
            type: ["object", "null"],
            description: "The user who triggered the event.",
            properties: {
              gid: {
                type: "string",
                description: "GID of the user.",
              },
              resource_type: {
                type: "string",
                description: "Resource type (user).",
              },
            },
          },
          created_at: {
            type: "string",
            description: "ISO 8601 timestamp when the event was created.",
          },
        },
      },
    },
  },
};

export const taskEventExample = {
  events: [
    {
      action: "changed",
      resource: {
        gid: "12345",
        resource_type: "task",
        resource_subtype: "default_task",
      },
      parent: {
        gid: "67890",
        resource_type: "project",
      },
      change: {
        field: "name",
        action: "changed",
        new_value: "Updated task name",
      },
      user: {
        gid: "11111",
        resource_type: "user",
      },
      created_at: "2024-01-15T10:00:00.000Z",
    },
  ],
};
