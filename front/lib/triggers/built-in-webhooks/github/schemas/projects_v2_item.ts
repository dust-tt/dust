import type { JSONSchema7 as JSONSchema } from "json-schema";

export const projectsV2ItemSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    action: {
      type: "string",
      description:
        "The action performed on the project item. Can be one of: created, edited, archived, restored, converted, deleted, reordered.",
      enum: [
        "archived",
        "converted",
        "created",
        "deleted",
        "edited",
        "reordered",
        "restored",
      ],
    },
    projects_v2_item: {
      type: "object",
      description: "The project item that was affected",
      properties: {
        id: {
          type: "integer",
          description: "Unique identifier of the project item",
        },
        node_id: {
          type: "string",
          description: "The GraphQL node ID of the project item",
        },
        project_node_id: {
          type: "string",
          description: "The GraphQL node ID of the project",
        },
        content_node_id: {
          type: "string",
          description:
            "The GraphQL node ID of the content (issue or pull request) associated with the item",
        },
        content_type: {
          type: "string",
          description:
            "The type of content associated with the item (Issue, PullRequest, or DraftIssue)",
          enum: ["Issue", "PullRequest", "DraftIssue"],
        },
        creator: {
          type: "object",
          description: "The user who created the project item",
          properties: {
            login: { type: "string", description: "GitHub username" },
            id: { type: "integer", description: "User ID" },
            type: { type: "string", description: "Type of user account" },
          },
        },
        created_at: {
          type: "string",
          format: "date-time",
          description: "When the project item was created",
        },
        updated_at: {
          type: "string",
          format: "date-time",
          description: "When the project item was last updated",
        },
        archived_at: {
          type: ["string", "null"],
          format: "date-time",
          description: "When the project item was archived",
        },
      },
    },
    changes: {
      type: "object",
      description:
        "The changes made to the project item when the action is edited",
      properties: {
        field_value: {
          type: "object",
          description: "The field value that was changed",
          properties: {
            field_node_id: {
              type: "string",
              description: "The GraphQL node ID of the field",
            },
            field_type: {
              type: "string",
              description: "The type of the field",
            },
            field_name: {
              type: "string",
              description: "The name of the field",
            },
            project_number: {
              type: "integer",
              description: "The project number",
            },
            from: {
              description: "The previous value of the field",
            },
            to: {
              description: "The new value of the field",
            },
          },
        },
      },
    },
    organization: {
      type: "object",
      description:
        "The organization that owns the project. Projects v2 items events are only available for organization-level projects.",
      properties: {
        login: { type: "string", description: "Organization login/name" },
        id: { type: "integer", description: "Organization ID" },
        node_id: {
          type: "string",
          description: "The GraphQL node ID of the organization",
        },
        description: {
          type: "string",
          description: "Organization description",
        },
      },
    },
    installation: {
      type: ["object", "null"],
      description:
        "GitHub App installation object when the event is configured for and sent to a GitHub App",
      properties: {
        id: { type: "integer", description: "Installation ID" },
      },
    },
    sender: {
      type: "object",
      description: "The user that triggered the event",
      properties: {
        login: { type: "string", description: "GitHub username" },
        id: { type: "integer", description: "User ID" },
        type: { type: "string", description: "Type of user account" },
        site_admin: {
          type: "boolean",
          description: "Whether user is a site administrator",
        },
      },
    },
  },
  required: ["action", "projects_v2_item", "sender"],
};

export const projectsV2ItemExample = {
  action: "created",
  projects_v2_item: {
    id: 12345678,
    node_id: "PVTI_lADOABCDEF",
    project_node_id: "PVT_kwDOABCDEF",
    content_node_id: "I_kwDOABCDEF",
    content_type: "Issue",
    creator: {
      login: "octocat",
      id: 1,
      type: "User",
    },
    created_at: "2024-01-20T10:30:00Z",
    updated_at: "2024-01-20T10:30:00Z",
    archived_at: null,
  },
  organization: {
    login: "my-org",
    id: 123456,
    node_id: "O_kgDOABCDEF",
    description: "My organization",
  },
  sender: {
    login: "octocat",
    id: 1,
    type: "User",
  },
};
