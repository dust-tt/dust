import { GithubLogo } from "@dust-tt/sparkle";
import type {
  EventField,
  WebhookEvent,
  PresetWebhook,
} from "@app/types/triggers/webhooks_source_preset";

const USER_CHILDREN_FIELDS: EventField[] = [
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
];

const LABEL_CHILDREN_FIELDS: EventField[] = [
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
];

const MILESTONE_CHILDREN_FIELDS: EventField[] = [
  {
    name: "html_url",
    description: "The GitHub web URL of the milestone.",
    type: "string",
  },
  {
    name: "id",
    description: "The unique identifier of the milestone.",
    type: "number",
  },
  {
    name: "number",
    description: "The milestone number.",
    type: "number",
  },
  {
    name: "title",
    description: "The title of the milestone.",
    type: "string",
  },
  {
    name: "description",
    description: "The description of the milestone.",
    type: "string",
  },
  {
    name: "creator",
    description: "The user who created the milestone.",
    type: "object",
    isArray: false,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "open_issues",
    description: "The number of open issues in the milestone.",
    type: "number",
  },
  {
    name: "closed_issues",
    description: "The number of closed issues in the milestone.",
    type: "number",
  },
  {
    name: "state",
    description: "The state of the milestone.",
    type: "enum",
    enumValues: ["open", "closed"],
  },
  {
    name: "created_at",
    description: "The timestamp when the milestone was created.",
    type: "string",
  },
  {
    name: "updated_at",
    description: "The timestamp when the milestone was last updated.",
    type: "string",
  },
  {
    name: "due_on",
    description: "The due date for the milestone.",
    type: "string",
  },
  {
    name: "closed_at",
    description: "The timestamp when the milestone was closed.",
    type: "string",
  },
];

const PULL_REQUEST_OBJECT_CHILDREN_FIELDS: EventField[] = [
  {
    name: "html_url",
    description: "The GitHub web URL of the pull request.",
    type: "string",
  },
  {
    name: "id",
    description: "The unique identifier of the pull request.",
    type: "number",
  },
  {
    name: "number",
    description: "The pull request number.",
    type: "number",
  },
  {
    name: "state",
    description: "The state of the pull request.",
    type: "enum",
    enumValues: ["open", "closed"],
  },
  {
    name: "locked",
    description: "Whether the pull request is locked.",
    type: "boolean",
  },
  {
    name: "title",
    description: "The title of the pull request.",
    type: "string",
  },
  {
    name: "user",
    description: "The user who created the pull request.",
    type: "object",
    isArray: false,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "body",
    description: "The body content of the pull request.",
    type: "string",
  },
  {
    name: "created_at",
    description: "The timestamp when the pull request was created.",
    type: "string",
  },
  {
    name: "updated_at",
    description: "The timestamp when the pull request was last updated.",
    type: "string",
  },
  {
    name: "merged_at",
    description: "The timestamp when the pull request was merged.",
    type: "string",
  },
  {
    name: "assignee",
    description: "The user assigned to the pull request.",
    type: "object",
    isArray: false,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "assignees",
    description: "The users assigned to the pull request.",
    type: "object",
    isArray: true,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "requested_reviewers",
    description: "The users requested to review the pull request.",
    type: "object",
    isArray: true,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "labels",
    description: "The labels applied to the pull request.",
    type: "object",
    isArray: true,
    childrenFields: LABEL_CHILDREN_FIELDS,
  },
  {
    name: "milestone",
    description: "The milestone associated with the pull request.",
    type: "object",
    isArray: false,
    childrenFields: MILESTONE_CHILDREN_FIELDS,
  },
  {
    name: "head",
    description: "The head branch of the pull request.",
    type: "object",
    isArray: false,
    childrenFields: [
      {
        name: "label",
        description: "The label of the head branch.",
        type: "string",
      },
      {
        name: "ref",
        description: "The ref of the head branch.",
        type: "string",
      },
    ],
  },
  {
    name: "base",
    description: "The base branch of the pull request.",
    type: "object",
    isArray: false,
    childrenFields: [
      {
        name: "label",
        description: "The label of the base branch.",
        type: "string",
      },
      {
        name: "ref",
        description: "The ref of the base branch.",
        type: "string",
      },
    ],
  },
  {
    name: "draft",
    description: "Whether the pull request is a draft.",
    type: "boolean",
  },
  {
    name: "merged",
    description: "Whether the pull request has been merged.",
    type: "boolean",
  },
  {
    name: "mergeable",
    description: "Whether the pull request is mergeable.",
    type: "boolean",
  },
  {
    name: "comments",
    description: "The number of comments on the pull request.",
    type: "number",
  },
  {
    name: "commits",
    description: "The number of commits in the pull request.",
    type: "number",
  },
  {
    name: "additions",
    description: "The number of additions in the pull request.",
    type: "number",
  },
  {
    name: "deletions",
    description: "The number of deletions in the pull request.",
    type: "number",
  },
  {
    name: "changed_files",
    description: "The number of changed files in the pull request.",
    type: "number",
  },
];

const ISSUE_OBJECT_CHILDREN_FIELDS: EventField[] = [
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
    type: "object",
    isArray: false,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "labels",
    description: "The labels applied to the issue.",
    type: "object",
    isArray: true,
    childrenFields: LABEL_CHILDREN_FIELDS,
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
    type: "object",
    isArray: false,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "assignees",
    description: "The users assigned to the issue.",
    type: "object",
    isArray: true,
    childrenFields: USER_CHILDREN_FIELDS,
  },
  {
    name: "milestone",
    description: "The milestone associated with the issue.",
    type: "object",
    isArray: false,
    childrenFields: MILESTONE_CHILDREN_FIELDS,
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
];

const GITHUB_PULL_REQUEST_EVENT: WebhookEvent = {
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
      type: "object",
      isArray: false,
      childrenFields: PULL_REQUEST_OBJECT_CHILDREN_FIELDS,
    },
    {
      name: "sender",
      description: "The user that triggered the event.",
      type: "object",
      isArray: false,
      childrenFields: USER_CHILDREN_FIELDS,
    },
  ],
};

const GITHUB_ISSUES_EVENT: WebhookEvent = {
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
      type: "object",
      isArray: false,
      childrenFields: ISSUE_OBJECT_CHILDREN_FIELDS,
    },
    {
      name: "assignee",
      description:
        "The optional user who was assigned or unassigned from the issue.",
      type: "object",
      isArray: false,
      childrenFields: USER_CHILDREN_FIELDS,
    },
    {
      name: "label",
      description:
        "The optional label that was added or removed from the issue.",
      type: "object",
      isArray: false,
      childrenFields: LABEL_CHILDREN_FIELDS,
    },
    {
      name: "sender",
      description: "The user that triggered the event.",
      type: "object",
      isArray: false,
      childrenFields: USER_CHILDREN_FIELDS,
    },
  ],
};

export const GITHUB_WEBHOOK_PRESET: PresetWebhook = {
  name: "GitHub",
  eventCheck: {
    type: "header",
    field: "X-GitHub-Event",
  },
  events: [GITHUB_PULL_REQUEST_EVENT, GITHUB_ISSUES_EVENT],
  icon: GithubLogo,
  description:
    "Receive events from GitHub such as creation or edition of issues or pull requests.",
};
