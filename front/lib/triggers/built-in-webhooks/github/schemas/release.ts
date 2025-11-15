import type { JSONSchema7 as JSONSchema } from "json-schema";

export const releaseSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "created",
        "deleted",
        "edited",
        "prereleased",
        "published",
        "released",
        "unpublished",
      ],
      description: "The action performed on the release",
    },
    changes: {
      type: "object",
      description: "The changes to the release if the action was edited",
      properties: {
        body: {
          type: "object",
          description: "Changes to the release body",
          properties: {
            from: {
              type: "string",
              description:
                "The previous version of the body if the action was edited",
            },
          },
        },
        name: {
          type: "object",
          description: "Changes to the release name",
          properties: {
            from: {
              type: "string",
              description:
                "The previous version of the name if the action was edited",
            },
          },
        },
      },
    },
    release: {
      type: "object",
      description: "The release that was affected",
      properties: {
        id: { type: "integer", description: "Release ID" },
        tag_name: { type: "string", description: "The tag name" },
        target_commitish: {
          type: "string",
          description:
            "Specifies the commitish value that determines where the Git tag is created from",
        },
        name: {
          type: ["string", "null"],
          description: "The name of the release",
        },
        body: {
          type: ["string", "null"],
          description: "Text describing the release",
        },
        draft: {
          type: "boolean",
          description: "Whether the release is a draft",
        },
        prerelease: {
          type: "boolean",
          description: "Whether the release is a prerelease",
        },
        created_at: {
          type: "string",
          format: "date-time",
          description: "When the release was created",
        },
        published_at: {
          type: ["string", "null"],
          format: "date-time",
          description: "When the release was published",
        },
        author: {
          type: "object",
          description: "User who created the release",
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
        assets: {
          type: "array",
          description: "Assets attached to the release",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", description: "Asset ID" },
              name: { type: "string", description: "Asset filename" },
              label: { type: ["string", "null"], description: "Asset label" },
              content_type: {
                type: "string",
                description: "MIME type of the asset",
              },
              size: { type: "integer", description: "Size in bytes" },
              download_count: {
                type: "integer",
                description: "Number of downloads",
              },
              created_at: {
                type: "string",
                format: "date-time",
                description: "When the asset was created",
              },
              updated_at: {
                type: "string",
                format: "date-time",
                description: "When the asset was last updated",
              },
            },
          },
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
  required: ["action", "release", "repository", "sender"],
};
