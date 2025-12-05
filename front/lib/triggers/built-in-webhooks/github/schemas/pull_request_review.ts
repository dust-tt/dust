import type { JSONSchema7 as JSONSchema } from "json-schema";

export const prReviewSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["submitted", "edited", "dismissed"],
      description: "The action performed on the pull request review",
    },
    review: {
      type: "object",
      description: "The review that was affected",
      properties: {
        id: { type: "integer", description: "Review ID" },
        user: {
          type: "object",
          description: "User who submitted the review",
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
        body: { type: ["string", "null"], description: "Review body text" },
        state: {
          type: "string",
          description: "Review state",
          enum: ["approved", "changes_requested", "commented", "dismissed"],
        },
        submitted_at: {
          type: "string",
          format: "date-time",
          description: "When the review was submitted",
        },
        commit_id: {
          type: "string",
          description: "SHA of the commit that was reviewed",
        },
      },
    },
    changes: {
      type: "object",
      description: "The changes to the review if the action was edited",
      properties: {
        body: {
          type: "object",
          description: "Changes to the review body",
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
    pull_request: {
      type: "object",
      description: "The pull request the review pertains to",
      properties: {
        id: { type: "integer", description: "Pull request ID" },
        number: { type: "integer", description: "Pull request number" },
        state: {
          type: "string",
          description: "State of the pull request (open or closed)",
        },
        locked: {
          type: "boolean",
          description: "Whether the pull request is locked",
        },
        title: {
          type: "string",
          description: "Title of the pull request",
        },
        user: {
          type: "object",
          description: "User who created the pull request",
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
        body: {
          type: ["string", "null"],
          description: "Pull request body/description",
        },
        created_at: {
          type: "string",
          format: "date-time",
          description: "When the pull request was created",
        },
        updated_at: {
          type: "string",
          format: "date-time",
          description: "When the pull request was last updated",
        },
        closed_at: {
          type: ["string", "null"],
          format: "date-time",
          description: "When the pull request was closed",
        },
        merged_at: {
          type: ["string", "null"],
          format: "date-time",
          description: "When the pull request was merged",
        },
        assignee: {
          type: ["object", "null"],
          description: "User assigned to the pull request",
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
          description: "Users assigned to the pull request",
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
        requested_reviewers: {
          type: "array",
          description: "Users requested to review the pull request",
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
        requested_teams: {
          type: "array",
          description: "Teams requested to review the pull request",
          items: { type: "object" },
        },
        labels: {
          type: "array",
          description: "Labels assigned to the pull request",
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
        milestone: {
          type: ["object", "null"],
          description: "Milestone associated with the pull request",
        },
        draft: {
          type: "boolean",
          description: "Whether the pull request is a draft",
        },
        head: {
          type: "object",
          description: "Head branch of the pull request",
          properties: {
            label: { type: "string", description: "Head branch label" },
            ref: { type: "string", description: "Head branch reference" },
            sha: { type: "string", description: "Head commit SHA" },
            user: {
              type: "object",
              description: "User who owns the head branch",
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
            repo: {
              type: "object",
              description: "Repository containing the head branch",
            },
          },
        },
        base: {
          type: "object",
          description: "Base branch of the pull request",
          properties: {
            label: { type: "string", description: "Base branch label" },
            ref: { type: "string", description: "Base branch reference" },
            sha: { type: "string", description: "Base commit SHA" },
            user: {
              type: "object",
              description: "User who owns the base branch",
            },
            repo: {
              type: "object",
              description: "Repository containing the base branch",
            },
          },
        },
        author_association: {
          type: "string",
          description: "Association of the author with the repository",
        },
        auto_merge: {
          type: ["object", "null"],
          description: "Auto merge configuration",
        },
        active_lock_reason: {
          type: ["string", "null"],
          description: "Reason the pull request is locked",
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
  required: ["action", "review", "pull_request", "repository", "sender"],
};
