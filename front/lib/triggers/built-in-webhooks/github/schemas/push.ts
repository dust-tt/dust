import type { JSONSchema7 as JSONSchema } from "json-schema";

export const pushSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    ref: {
      type: "string",
      description:
        "The full git ref that was pushed. Example: `refs/heads/main` or `refs/tags/v3.14.1`.",
    },
    before: {
      type: "string",
      description:
        "The SHA of the most recent commit on `ref` before the push.",
    },
    after: {
      type: "string",
      description: "The SHA of the most recent commit on `ref` after the push.",
    },
    created: {
      type: "boolean",
      description: "Whether this push created the `ref`.",
    },
    deleted: {
      type: "boolean",
      description: "Whether this push deleted the `ref`.",
    },
    forced: {
      type: "boolean",
      description: "Whether this push was a force push of the `ref`.",
    },
    base_ref: {
      type: ["string", "null"],
      description: "The base reference for the push",
    },
    compare: {
      type: "string",
      description:
        "URL that shows the changes in this `ref` update, from the `before` commit to the `after` commit.",
    },
    commits: {
      type: "array",
      description:
        "An array of commit objects describing the pushed commits. The array includes a maximum of 20 commits.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Commit SHA",
          },
          tree_id: {
            type: "string",
            description: "Tree SHA",
          },
          distinct: {
            type: "boolean",
            description:
              "Whether this commit is distinct from any that have been pushed before.",
          },
          message: {
            type: "string",
            description: "The commit message.",
          },
          timestamp: {
            type: "string",
            format: "date-time",
            description: "The ISO 8601 timestamp of the commit.",
          },
          url: {
            type: "string",
            format: "uri",
            description: "URL that points to the commit API resource.",
          },
          author: {
            type: "object",
            description: "Git author information",
            properties: {
              name: {
                type: "string",
                description: "The git author's name.",
              },
              email: {
                type: ["string", "null"],
                description: "The git author's email address.",
              },
              date: {
                type: "string",
                format: "date-time",
                description: "Date of the commit",
              },
              username: {
                type: "string",
                description: "GitHub username",
              },
            },
          },
          committer: {
            type: "object",
            description: "Git committer information",
            properties: {
              name: {
                type: "string",
                description: "The git committer's name.",
              },
              email: {
                type: ["string", "null"],
                description: "The git committer's email address.",
              },
              date: {
                type: "string",
                format: "date-time",
                description: "Date of the commit",
              },
              username: {
                type: "string",
                description: "GitHub username",
              },
            },
          },
          added: {
            type: "array",
            items: {
              type: "string",
            },
            description: "An array of files added in the commit.",
          },
          modified: {
            type: "array",
            items: {
              type: "string",
            },
            description: "An array of files modified by the commit.",
          },
          removed: {
            type: "array",
            items: {
              type: "string",
            },
            description: "An array of files removed in the commit.",
          },
        },
      },
    },
    head_commit: {
      type: ["object", "null"],
      description:
        "For pushes where `after` is or points to a commit object, an expanded representation of that commit.",
      properties: {
        id: {
          type: "string",
          description: "Commit SHA",
        },
        tree_id: {
          type: "string",
          description: "Tree SHA",
        },
        distinct: {
          type: "boolean",
          description:
            "Whether this commit is distinct from any that have been pushed before.",
        },
        message: {
          type: "string",
          description: "The commit message.",
        },
        timestamp: {
          type: "string",
          format: "date-time",
          description: "The ISO 8601 timestamp of the commit.",
        },
        url: {
          type: "string",
          format: "uri",
          description: "URL that points to the commit API resource.",
        },
        author: {
          type: "object",
          description: "Git author information",
          properties: {
            name: {
              type: "string",
              description: "The git author's name.",
            },
            email: {
              type: ["string", "null"],
              description: "The git author's email address.",
            },
            date: {
              type: "string",
              format: "date-time",
              description: "Date of the commit",
            },
            username: {
              type: "string",
              description: "GitHub username",
            },
          },
        },
        committer: {
          type: "object",
          description: "Git committer information",
          properties: {
            name: {
              type: "string",
              description: "The git committer's name.",
            },
            email: {
              type: ["string", "null"],
              description: "The git committer's email address.",
            },
            date: {
              type: "string",
              format: "date-time",
              description: "Date of the commit",
            },
            username: {
              type: "string",
              description: "GitHub username",
            },
          },
        },
        added: {
          type: "array",
          items: {
            type: "string",
          },
          description: "An array of files added in the commit.",
        },
        modified: {
          type: "array",
          items: {
            type: "string",
          },
          description: "An array of files modified by the commit.",
        },
        removed: {
          type: "array",
          items: {
            type: "string",
          },
          description: "An array of files removed in the commit.",
        },
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
        owner: { type: "object", description: "Repository owner" },
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
        homepage: {
          type: ["string", "null"],
          description: "Repository homepage URL",
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
        web_commit_signoff_required: {
          type: "boolean",
          description: "Whether web commit signoff is required",
        },
        custom_properties: {
          type: "object",
          description: "Custom repository properties",
        },
      },
    },
    pusher: {
      type: "object",
      description: "The person who pushed the commits",
      properties: {
        name: {
          type: "string",
          description: "The pusher's name.",
        },
        email: {
          type: ["string", "null"],
          description: "The pusher's email address.",
        },
        date: {
          type: "string",
          format: "date-time",
          description: "Date of the push",
        },
        username: {
          type: "string",
          description: "GitHub username",
        },
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
    installation: {
      type: ["object", "null"],
      description:
        "GitHub App installation object when the event is configured for and sent to a GitHub App",
      properties: {
        id: { type: "integer", description: "Installation ID" },
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
  },
  required: [
    "ref",
    "before",
    "after",
    "created",
    "deleted",
    "forced",
    "base_ref",
    "compare",
    "commits",
    "head_commit",
    "repository",
    "pusher",
    "sender",
  ],
};
