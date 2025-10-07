import type { EventType, PresetWebhookType } from "./webhooks_source_preset";

const GITHUB_PULL_REQUEST_EVENT: EventType = {
  name: "pull_request",
  value: "pull_request",
  description:
    "Activity related to pull requests. The type of activity is specified in the `action` property of the payload object.",
  fields: [
    {
      name: "action",
      description: "The action that was performed on the pull request.",
      type: "enum",
      enumValues: [
        "assigned",
        "auto_merge_disabled",
        "auto_merge_enabled",
        "closed",
        "converted_to_draft",
        "dequeued",
        "edited",
        "enqueued",
        "labeled",
        "locked",
        "merged",
        "opened",
        "ready_for_review",
        "reopened",
        "review_request_removed",
        "review_requested",
        "synchronize",
        "unassigned",
        "unlabeled",
        "unlocked",
      ],
    },
    {
      name: "number",
      description: "The pull request number.",
      type: "number",
    },
    {
      name: "pull_request",
      description: "The pull request itself.",
      type: "unknown-object",
    },
    {
      name: "repository",
      description: "The repository where the event occurred.",
      type: "unknown-object",
    },
    {
      name: "sender",
      description: "The user that triggered the event.",
      type: "parent-field",
      childrentFields: [
        {
          name: "login",
          description: "The username of the user.",
          type: "string",
        },
        {
          name: "id",
          description: "The unique identifier of the user.",
          type: "number",
        },
        {
          name: "url",
          description: "The API URL of the user.",
          type: "string",
        },
        {
          name: "html_url",
          description: "The GitHub profile URL of the user.",
          type: "string",
        },
        {
          name: "type",
          description: "The type of the user account.",
          type: "enum",
          enumValues: ["User", "Organization"],
        },
        {
          name: "site_admin",
          description: "Whether the user is a GitHub site administrator.",
          type: "boolean",
        },
      ],
    },
  ],
};

const GITHUB_ISSUES_EVENT: EventType = {
  name: "issues",
  value: "issues",
  description:
    "Activity related to an issue. The type of activity is specified in the `action` property of the payload object.",
  fields: [
    {
      name: "action",
      description: "The action that was performed on the issue.",
      type: "enum",
      enumValues: [
        "assigned",
        "closed",
        "deleted",
        "demilestoned",
        "edited",
        "labeled",
        "locked",
        "milestoned",
        "opened",
        "pinned",
        "reopened",
        "transferred",
        "unassigned",
        "unlabeled",
        "unlocked",
        "unpinned",
      ],
    },
    {
      name: "issue",
      description: "The issue itself.",
      type: "parent-field",
      childrentFields: [
        {
          name: "url",
          description: "The API URL of the issue.",
          type: "string",
        },
        {
          name: "id",
          description: "The unique identifier of the issue.",
          type: "number",
        },
        {
          name: "number",
          description: "The issue number.",
          type: "number",
        },
        {
          name: "title",
          description: "The title of the issue.",
          type: "string",
        },
        {
          name: "user",
          description: "The user who created the issue.",
          type: "parent-field",
          childrentFields: [
            {
              name: "login",
              description: "The username of the user.",
              type: "string",
            },
            {
              name: "id",
              description: "The unique identifier of the user.",
              type: "number",
            },
            {
              name: "html_url",
              description: "The GitHub profile URL of the user.",
              type: "string",
            },
            {
              name: "type",
              description: "The type of the user account.",
              type: "enum",
              enumValues: ["User", "Organization"],
            },
            {
              name: "site_admin",
              description: "Whether the user is a GitHub site administrator.",
              type: "boolean",
            },
          ],
        },
        {
          name: "labels",
          description: "The labels applied to the issue.",
          type: "parent-of-array",
          childrentFields: [
            {
              name: "id",
              description: "The unique identifier of the label.",
              type: "number",
            },
            {
              name: "url",
              description: "The API URL of the label.",
              type: "string",
            },
            {
              name: "name",
              description: "The name of the label.",
              type: "string",
            },
            {
              name: "default",
              description: "Whether this is a default label.",
              type: "boolean",
            },
          ],
        },
        {
          name: "state",
          description: "The state of the issue.",
          type: "enum",
          enumValues: ["open", "closed", "all"],
        },
        {
          name: "locked",
          description: "Whether the issue is locked.",
          type: "boolean",
        },
        {
          name: "assignee",
          description: "The user assigned to the issue.",
          type: "parent-field",
          childrentFields: [
            {
              name: "login",
              description: "The username of the user.",
              type: "string",
            },
            {
              name: "id",
              description: "The unique identifier of the user.",
              type: "number",
            },
            {
              name: "html_url",
              description: "The GitHub profile URL of the user.",
              type: "string",
            },
            {
              name: "type",
              description: "The type of the user account.",
              type: "enum",
              enumValues: ["User", "Organization"],
            },
          ],
        },
        {
          name: "assignees",
          description: "The users assigned to the issue.",
          type: "parent-of-array",
          childrentFields: [
            {
              name: "login",
              description: "The username of the user.",
              type: "string",
            },
            {
              name: "id",
              description: "The unique identifier of the user.",
              type: "number",
            },
            {
              name: "html_url",
              description: "The GitHub profile URL of the user.",
              type: "string",
            },
            {
              name: "type",
              description: "The type of the user account.",
              type: "enum",
              enumValues: ["User", "Organization"],
            },
            {
              name: "site_admin",
              description: "Whether the user is a GitHub site administrator.",
              type: "boolean",
            },
          ],
        },
        {
          name: "milestone",
          description: "The milestone associated with the issue.",
          type: "unknown-object",
        },
        {
          name: "comments",
          description: "The number of comments on the issue.",
          type: "number",
        },
        {
          name: "created_at",
          description: "The timestamp when the issue was created.",
          type: "string",
        },
        {
          name: "updated_at",
          description: "The timestamp when the issue was last updated.",
          type: "string",
        },
        {
          name: "closed_at",
          description: "The timestamp when the issue was closed.",
          type: "string",
        },
        {
          name: "author_association",
          description: "The association of the author with the repository.",
          type: "string",
        },
        {
          name: "body",
          description: "The body content of the issue.",
          type: "string",
        },
      ],
    },
    {
      name: "assignee",
      description:
        "The optional user who was assigned or unassigned from the issue.",
      type: "parent-field",
      childrentFields: [
        {
          name: "login",
          description: "The username of the user.",
          type: "string",
        },
        {
          name: "id",
          description: "The unique identifier of the user.",
          type: "number",
        },
        {
          name: "html_url",
          description: "The GitHub profile URL of the user.",
          type: "string",
        },
        {
          name: "type",
          description: "The type of the user account.",
          type: "enum",
          enumValues: ["User", "Organization"],
        },
        {
          name: "site_admin",
          description: "Whether the user is a GitHub site administrator.",
          type: "boolean",
        },
      ],
    },
    {
      name: "label",
      description:
        "The optional label that was added or removed from the issue.",
      type: "parent-field",
      childrentFields: [
        {
          name: "id",
          description: "The unique identifier of the label.",
          type: "number",
        },
        {
          name: "url",
          description: "The API URL of the label.",
          type: "string",
        },
        {
          name: "name",
          description: "The name of the label.",
          type: "string",
        },
      ],
    },
    {
      name: "sender",
      description: "The user that triggered the event.",
      type: "parent-field",
      childrentFields: [
        {
          name: "login",
          description: "The username of the user.",
          type: "string",
        },
        {
          name: "id",
          description: "The unique identifier of the user.",
          type: "number",
        },
        {
          name: "html_url",
          description: "The GitHub profile URL of the user.",
          type: "string",
        },
        {
          name: "type",
          description: "The type of the user account.",
          type: "enum",
          enumValues: ["User", "Organization"],
        },
        {
          name: "site_admin",
          description: "Whether the user is a GitHub site administrator.",
          type: "boolean",
        },
      ],
    },
  ],
};

export const GITHUB_WEBHOOK_PRESET: PresetWebhookType = {
  name: "GitHub",
  eventCheck: {
    type: "header",
    field: "X-GitHub-Event",
  },
  events: [GITHUB_PULL_REQUEST_EVENT, GITHUB_ISSUES_EVENT],
};
