import type { JSONSchema7 as JSONSchema } from "json-schema";

export const issueSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    action: {
      type: "string",
      description: "The type of activity related to the issue",
      enum: [
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
    issue: {
      type: "object",
      description: "The issue itself",
      properties: {
        id: {
          type: "integer",
          description: "Unique identifier of the issue",
        },
        number: { type: "integer", description: "Issue number" },
        title: { type: "string", description: "Title of the issue" },
        user: {
          type: "object",
          description: "User who created the issue",
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
        labels: {
          type: "array",
          description: "Labels assigned to the issue",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", description: "Label ID" },
              name: { type: "string", description: "Label name" },
              default: {
                type: "boolean",
                description: "Whether this is a default label",
              },
              description: {
                type: "string",
                description: "Label description",
              },
            },
          },
        },
        state: {
          type: "string",
          description: "State of the issue (open or closed)",
        },
        locked: {
          type: "boolean",
          description: "Whether the issue is locked",
        },
        assignee: {
          type: ["object", "null"],
          description: "User assigned to the issue",
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
        assignees: {
          type: "array",
          description: "Users assigned to the issue",
          items: {
            type: "object",
            properties: {
              login: { type: "string", description: "GitHub username" },
              id: { type: "integer", description: "User ID" },
              type: {
                type: "string",
                description: "Type of user account",
              },
              site_admin: {
                type: "boolean",
                description: "Whether user is a site administrator",
              },
            },
          },
        },
        milestone: {
          type: ["object", "null"],
          description: "Milestone associated with the issue",
          properties: {
            id: { type: "integer", description: "Milestone ID" },
            number: { type: "integer", description: "Milestone number" },
            title: { type: "string", description: "Milestone title" },
            description: {
              type: "string",
              description: "Milestone description",
            },
            creator: {
              type: "object",
              description: "User who created the milestone",
              properties: {
                login: { type: "string", description: "GitHub username" },
                id: { type: "integer", description: "User ID" },
                type: {
                  type: "string",
                  description: "Type of user account",
                },
                site_admin: {
                  type: "boolean",
                  description: "Whether user is a site administrator",
                },
              },
            },
            open_issues: {
              type: "integer",
              description: "Number of open issues in milestone",
            },
            closed_issues: {
              type: "integer",
              description: "Number of closed issues in milestone",
            },
            state: {
              type: "string",
              description: "State of the milestone",
            },
            created_at: {
              type: "string",
              format: "date-time",
              description: "When the milestone was created",
            },
            updated_at: {
              type: "string",
              format: "date-time",
              description: "When the milestone was last updated",
            },
            due_on: {
              type: ["string", "null"],
              format: "date-time",
              description: "Due date of the milestone",
            },
            closed_at: {
              type: ["string", "null"],
              format: "date-time",
              description: "When the milestone was closed",
            },
          },
        },
        comments: {
          type: "integer",
          description: "Number of comments on the issue",
        },
        created_at: {
          type: "string",
          format: "date-time",
          description: "When the issue was created",
        },
        updated_at: {
          type: "string",
          format: "date-time",
          description: "When the issue was last updated",
        },
        closed_at: {
          type: ["string", "null"],
          format: "date-time",
          description: "When the issue was closed",
        },
        author_association: {
          type: "string",
          description: "Association of the author with the repository",
        },
        active_lock_reason: {
          type: ["string", "null"],
          description: "Reason the issue is locked",
        },
        body: { type: "string", description: "Issue body/description" },
        reactions: {
          type: "object",
          description: "Reactions to the issue",
          properties: {
            total_count: {
              type: "integer",
              description: "Total number of reactions",
            },
            "+1": {
              type: "integer",
              description: "Number of +1 reactions",
            },
            "-1": {
              type: "integer",
              description: "Number of -1 reactions",
            },
            laugh: {
              type: "integer",
              description: "Number of laugh reactions",
            },
            hooray: {
              type: "integer",
              description: "Number of hooray reactions",
            },
            confused: {
              type: "integer",
              description: "Number of confused reactions",
            },
            heart: {
              type: "integer",
              description: "Number of heart reactions",
            },
            rocket: {
              type: "integer",
              description: "Number of rocket reactions",
            },
            eyes: {
              type: "integer",
              description: "Number of eyes reactions",
            },
          },
        },
        draft: {
          type: "boolean",
          description: "Whether the issue is a draft",
        },
      },
    },
    changes: {
      type: "object",
      description: "The changes to the issue if the action was edited",
      properties: {
        title: {
          type: "object",
          description: "Changes to the issue title",
          properties: {
            from: {
              type: "string",
              description:
                "The previous version of the title if the action was edited",
            },
          },
        },
        body: {
          type: "object",
          description: "Changes to the issue body",
          properties: {
            from: {
              type: "string",
              description:
                "The previous version of the body if the action was edited",
            },
          },
        },
      },
    },
    assignee: {
      type: ["object", "null"],
      description:
        "The optional user who was assigned or unassigned from the issue",
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
    label: {
      type: ["object", "null"],
      description:
        "The optional label that was added or removed from the issue",
      properties: {
        id: { type: "integer", description: "Label ID" },
        name: { type: "string", description: "Label name" },
        default: {
          type: "boolean",
          description: "Whether this is a default label",
        },
        description: { type: "string", description: "Label description" },
      },
    },
    repository: {
      type: "object",
      description: "The repository where the event occurred",
      properties: {
        id: { type: "integer", description: "Repository ID" },
        name: { type: "string", description: "Repository name" },
        full_name: {
          type: "string",
          description: "Full repository name (owner/repo)",
        },
        private: {
          type: "boolean",
          description: "Whether the repository is private",
        },
        owner: {
          type: "object",
          description: "Repository owner",
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
        description: {
          type: ["string", "null"],
          description: "Repository description",
        },
        fork: {
          type: "boolean",
          description: "Whether the repository is a fork",
        },

        created_at: {
          type: "string",
          format: "date-time",
          description: "When the repository was created",
        },
        updated_at: {
          type: "string",
          format: "date-time",
          description: "When the repository was last updated",
        },
        pushed_at: {
          type: "string",
          format: "date-time",
          description: "When the repository was last pushed to",
        },
        size: { type: "integer", description: "Repository size in KB" },
        stargazers_count: {
          type: "integer",
          description: "Number of stars",
        },
        watchers_count: {
          type: "integer",
          description: "Number of watchers",
        },
        language: {
          type: ["string", "null"],
          description: "Primary programming language",
        },
        has_issues: {
          type: "boolean",
          description: "Whether issues are enabled",
        },
        has_projects: {
          type: "boolean",
          description: "Whether projects are enabled",
        },
        has_downloads: {
          type: "boolean",
          description: "Whether downloads are enabled",
        },
        has_wiki: {
          type: "boolean",
          description: "Whether wiki is enabled",
        },
        has_pages: {
          type: "boolean",
          description: "Whether GitHub Pages is enabled",
        },
        forks_count: { type: "integer", description: "Number of forks" },
        archived: {
          type: "boolean",
          description: "Whether the repository is archived",
        },
        disabled: {
          type: "boolean",
          description: "Whether the repository is disabled",
        },
        open_issues_count: {
          type: "integer",
          description: "Number of open issues",
        },
        license: {
          type: ["string", "null"],
          description: "Repository license",
        },
        forks: { type: "integer", description: "Number of forks" },
        open_issues: {
          type: "integer",
          description: "Number of open issues",
        },
        watchers: { type: "integer", description: "Number of watchers" },
        default_branch: {
          type: "string",
          description: "Default branch name",
        },
        is_template: {
          type: "boolean",
          description: "Whether the repository is a template",
        },
        topics: {
          type: "array",
          items: { type: "string" },
          description: "Repository topics",
        },
        visibility: {
          type: "string",
          description: "Repository visibility (public/private)",
        },
        custom_properties: {
          type: "object",
          description: "Custom repository properties",
        },
      },
    },
    organization: {
      type: ["object", "null"],
      description:
        "Organization object when the webhook is configured for an organization or the event occurs from activity in a repository owned by an organization",
      properties: {
        login: { type: "string", description: "Organization login/name" },
        id: { type: "integer", description: "Organization ID" },
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
  required: ["action", "issue", "repository", "sender"],
};

export const issueExample = {
  action: "opened",
  issue: {
    url: "https://api.github.com/repos/octocat/Hello-World/issues/1347",
    id: 1234567890,
    number: 1347,
    title: "Bug: Application crashes on startup",
    user: {
      login: "octocat",
      id: 1,
      avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
      type: "User",
    },
    labels: [
      {
        id: 208045946,
        name: "bug",
        color: "d73a4a",
      },
    ],
    state: "open",
    locked: false,
    assignee: null,
    assignees: [],
    comments: 0,
    created_at: "2023-01-20T10:30:00Z",
    updated_at: "2023-01-20T10:30:00Z",
    closed_at: null,
    body: "The application crashes when starting up on Windows 11. Steps to reproduce: ...",
  },
  repository: {
    id: 1296269,
    name: "Hello-World",
    full_name: "octocat/Hello-World",
    owner: {
      login: "octocat",
      id: 1,
    },
    html_url: "https://github.com/octocat/Hello-World",
    description: "My first repository on GitHub!",
  },
  sender: {
    login: "octocat",
    id: 1,
    type: "User",
  },
};
