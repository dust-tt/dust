import type { JSONSchema7 as JSONSchema } from "json-schema";

export const prReviewSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema",
  type: "object",
  title: "pull_request_review event",
  required: ["action", "review", "pull_request", "repository", "sender"],
  properties: {
    action: {
      type: "string",
      enum: ["submitted", "edited", "dismissed"],
      description: "The action performed on the pull request review",
    },
    review: {
      $ref: "#/definitions/pull-request-review",
      description: "The review that was affected",
    },
    changes: {
      type: "object",
      description: "The changes to the review if the action was edited",
      properties: {
        body: {
          type: "object",
          required: ["from"],
          properties: {
            from: {
              type: "string",
              description:
                "The previous version of the body if the action was edited",
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    pull_request: {
      $schema: "http://json-schema.org/draft-07/schema",
      description: "The pull request the review pertains to",
      required: [
        "url",
        "id",
        "node_id",
        "html_url",
        "diff_url",
        "patch_url",
        "issue_url",
        "number",
        "state",
        "locked",
        "title",
        "user",
        "body",
        "created_at",
        "updated_at",
        "closed_at",
        "merged_at",
        "merge_commit_sha",
        "assignee",
        "assignees",
        "requested_reviewers",
        "requested_teams",
        "labels",
        "milestone",
        "draft",
        "commits_url",
        "review_comments_url",
        "review_comment_url",
        "comments_url",
        "statuses_url",
        "head",
        "base",
        "_links",
        "author_association",
        "auto_merge",
        "active_lock_reason",
      ],
      type: "object",
      properties: {
        url: {
          type: "string",
          format: "uri",
        },
        id: {
          type: "integer",
        },
        node_id: {
          type: "string",
        },
        html_url: {
          type: "string",
          format: "uri",
        },
        diff_url: {
          type: "string",
          format: "uri",
        },
        patch_url: {
          type: "string",
          format: "uri",
        },
        issue_url: {
          type: "string",
          format: "uri",
        },
        number: {
          type: "integer",
        },
        state: {
          type: "string",
          enum: ["open", "closed"],
        },
        locked: {
          type: "boolean",
        },
        title: {
          type: "string",
        },
        user: {
          $schema: "http://json-schema.org/draft-07/schema",
          type: "object",
          required: [
            "login",
            "id",
            "node_id",
            "avatar_url",
            "gravatar_id",
            "url",
            "html_url",
            "followers_url",
            "following_url",
            "gists_url",
            "starred_url",
            "subscriptions_url",
            "organizations_url",
            "repos_url",
            "events_url",
            "received_events_url",
            "type",
            "site_admin",
          ],
          properties: {
            login: {
              type: "string",
            },
            id: {
              type: "integer",
            },
            node_id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            email: {
              type: ["string", "null"],
            },
            avatar_url: {
              type: "string",
              format: "uri",
            },
            gravatar_id: {
              type: "string",
            },
            url: {
              type: "string",
              format: "uri",
            },
            html_url: {
              type: "string",
              format: "uri",
            },
            followers_url: {
              type: "string",
              format: "uri",
            },
            following_url: {
              type: "string",
              format: "uri-template",
            },
            gists_url: {
              type: "string",
              format: "uri-template",
            },
            starred_url: {
              type: "string",
              format: "uri-template",
            },
            subscriptions_url: {
              type: "string",
              format: "uri",
            },
            organizations_url: {
              type: "string",
              format: "uri",
            },
            repos_url: {
              type: "string",
              format: "uri",
            },
            events_url: {
              type: "string",
              format: "uri-template",
            },
            received_events_url: {
              type: "string",
              format: "uri",
            },
            type: {
              type: "string",
              enum: ["Bot", "User", "Organization"],
            },
            site_admin: {
              type: "boolean",
            },
          },
          additionalProperties: false,
          title: "User",
        },
        body: {
          type: ["string", "null"],
        },
        created_at: {
          type: "string",
          format: "date-time",
        },
        updated_at: {
          type: "string",
          format: "date-time",
        },
        closed_at: {
          oneOf: [
            {
              type: "string",
              format: "date-time",
            },
            {
              type: "null",
            },
          ],
        },
        merged_at: {
          oneOf: [
            {
              type: "string",
              format: "date-time",
            },
            {
              type: "null",
            },
          ],
        },
        merge_commit_sha: {
          type: ["string", "null"],
        },
        assignee: {
          oneOf: [
            {
              $schema: "http://json-schema.org/draft-07/schema",
              type: "object",
              required: [
                "login",
                "id",
                "node_id",
                "avatar_url",
                "gravatar_id",
                "url",
                "html_url",
                "followers_url",
                "following_url",
                "gists_url",
                "starred_url",
                "subscriptions_url",
                "organizations_url",
                "repos_url",
                "events_url",
                "received_events_url",
                "type",
                "site_admin",
              ],
              properties: {
                login: {
                  type: "string",
                },
                id: {
                  type: "integer",
                },
                node_id: {
                  type: "string",
                },
                name: {
                  type: "string",
                },
                email: {
                  type: ["string", "null"],
                },
                avatar_url: {
                  type: "string",
                  format: "uri",
                },
                gravatar_id: {
                  type: "string",
                },
                url: {
                  type: "string",
                  format: "uri",
                },
                html_url: {
                  type: "string",
                  format: "uri",
                },
                followers_url: {
                  type: "string",
                  format: "uri",
                },
                following_url: {
                  type: "string",
                  format: "uri-template",
                },
                gists_url: {
                  type: "string",
                  format: "uri-template",
                },
                starred_url: {
                  type: "string",
                  format: "uri-template",
                },
                subscriptions_url: {
                  type: "string",
                  format: "uri",
                },
                organizations_url: {
                  type: "string",
                  format: "uri",
                },
                repos_url: {
                  type: "string",
                  format: "uri",
                },
                events_url: {
                  type: "string",
                  format: "uri-template",
                },
                received_events_url: {
                  type: "string",
                  format: "uri",
                },
                type: {
                  type: "string",
                  enum: ["Bot", "User", "Organization"],
                },
                site_admin: {
                  type: "boolean",
                },
              },
              additionalProperties: false,
              title: "User",
            },
            {
              type: "null",
            },
          ],
        },
        assignees: {
          type: "array",
          items: {
            $schema: "http://json-schema.org/draft-07/schema",
            type: "object",
            required: [
              "login",
              "id",
              "node_id",
              "avatar_url",
              "gravatar_id",
              "url",
              "html_url",
              "followers_url",
              "following_url",
              "gists_url",
              "starred_url",
              "subscriptions_url",
              "organizations_url",
              "repos_url",
              "events_url",
              "received_events_url",
              "type",
              "site_admin",
            ],
            properties: {
              login: {
                type: "string",
              },
              id: {
                type: "integer",
              },
              node_id: {
                type: "string",
              },
              name: {
                type: "string",
              },
              email: {
                type: ["string", "null"],
              },
              avatar_url: {
                type: "string",
                format: "uri",
              },
              gravatar_id: {
                type: "string",
              },
              url: {
                type: "string",
                format: "uri",
              },
              html_url: {
                type: "string",
                format: "uri",
              },
              followers_url: {
                type: "string",
                format: "uri",
              },
              following_url: {
                type: "string",
                format: "uri-template",
              },
              gists_url: {
                type: "string",
                format: "uri-template",
              },
              starred_url: {
                type: "string",
                format: "uri-template",
              },
              subscriptions_url: {
                type: "string",
                format: "uri",
              },
              organizations_url: {
                type: "string",
                format: "uri",
              },
              repos_url: {
                type: "string",
                format: "uri",
              },
              events_url: {
                type: "string",
                format: "uri-template",
              },
              received_events_url: {
                type: "string",
                format: "uri",
              },
              type: {
                type: "string",
                enum: ["Bot", "User", "Organization"],
              },
              site_admin: {
                type: "boolean",
              },
            },
            additionalProperties: false,
            title: "User",
          },
        },
        requested_reviewers: {
          type: "array",
          items: {
            oneOf: [
              {
                $schema: "http://json-schema.org/draft-07/schema",
                type: "object",
                required: [
                  "login",
                  "id",
                  "node_id",
                  "avatar_url",
                  "gravatar_id",
                  "url",
                  "html_url",
                  "followers_url",
                  "following_url",
                  "gists_url",
                  "starred_url",
                  "subscriptions_url",
                  "organizations_url",
                  "repos_url",
                  "events_url",
                  "received_events_url",
                  "type",
                  "site_admin",
                ],
                properties: {
                  login: {
                    type: "string",
                  },
                  id: {
                    type: "integer",
                  },
                  node_id: {
                    type: "string",
                  },
                  name: {
                    type: "string",
                  },
                  email: {
                    type: ["string", "null"],
                  },
                  avatar_url: {
                    type: "string",
                    format: "uri",
                  },
                  gravatar_id: {
                    type: "string",
                  },
                  url: {
                    type: "string",
                    format: "uri",
                  },
                  html_url: {
                    type: "string",
                    format: "uri",
                  },
                  followers_url: {
                    type: "string",
                    format: "uri",
                  },
                  following_url: {
                    type: "string",
                    format: "uri-template",
                  },
                  gists_url: {
                    type: "string",
                    format: "uri-template",
                  },
                  starred_url: {
                    type: "string",
                    format: "uri-template",
                  },
                  subscriptions_url: {
                    type: "string",
                    format: "uri",
                  },
                  organizations_url: {
                    type: "string",
                    format: "uri",
                  },
                  repos_url: {
                    type: "string",
                    format: "uri",
                  },
                  events_url: {
                    type: "string",
                    format: "uri-template",
                  },
                  received_events_url: {
                    type: "string",
                    format: "uri",
                  },
                  type: {
                    type: "string",
                    enum: ["Bot", "User", "Organization"],
                  },
                  site_admin: {
                    type: "boolean",
                  },
                },
                additionalProperties: false,
                title: "User",
              },
              {
                $schema: "http://json-schema.org/draft-07/schema",
                description:
                  "Groups of organization members that gives permissions on specified repositories.",
                type: "object",
                required: [
                  "name",
                  "id",
                  "node_id",
                  "slug",
                  "description",
                  "privacy",
                  "url",
                  "html_url",
                  "members_url",
                  "repositories_url",
                  "permission",
                ],
                properties: {
                  name: {
                    type: "string",
                    description: "Name of the team",
                  },
                  id: {
                    type: "integer",
                    description: "Unique identifier of the team",
                  },
                  node_id: {
                    type: "string",
                  },
                  slug: {
                    type: "string",
                  },
                  description: {
                    type: ["string", "null"],
                    description: "Description of the team",
                  },
                  privacy: {
                    type: "string",
                    enum: ["open", "closed", "secret"],
                  },
                  url: {
                    type: "string",
                    format: "uri",
                    description: "URL for the team",
                  },
                  html_url: {
                    type: "string",
                    format: "uri",
                  },
                  members_url: {
                    type: "string",
                    format: "uri-template",
                  },
                  repositories_url: {
                    type: "string",
                    format: "uri",
                  },
                  permission: {
                    type: "string",
                    description:
                      "Permission that the team will have for its repositories",
                  },
                  parent: {
                    type: ["object", "null"],
                    required: [
                      "name",
                      "id",
                      "node_id",
                      "slug",
                      "description",
                      "privacy",
                      "url",
                      "html_url",
                      "members_url",
                      "repositories_url",
                      "permission",
                    ],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the team",
                      },
                      id: {
                        type: "integer",
                        description: "Unique identifier of the team",
                      },
                      node_id: {
                        type: "string",
                      },
                      slug: {
                        type: "string",
                      },
                      description: {
                        type: ["string", "null"],
                        description: "Description of the team",
                      },
                      privacy: {
                        type: "string",
                        enum: ["open", "closed", "secret"],
                      },
                      url: {
                        type: "string",
                        format: "uri",
                        description: "URL for the team",
                      },
                      html_url: {
                        type: "string",
                        format: "uri",
                      },
                      members_url: {
                        type: "string",
                        format: "uri-template",
                      },
                      repositories_url: {
                        type: "string",
                        format: "uri",
                      },
                      permission: {
                        type: "string",
                        description:
                          "Permission that the team will have for its repositories",
                      },
                      notification_setting: {
                        type: "string",
                        enum: [
                          "notifications_enabled",
                          "notifications_disabled",
                        ],
                        description:
                          "Whether team members will receive notifications when their team is @mentioned",
                      },
                    },
                    additionalProperties: false,
                  },
                  notification_setting: {
                    type: "string",
                    enum: ["notifications_enabled", "notifications_disabled"],
                    description:
                      "Whether team members will receive notifications when their team is @mentioned",
                  },
                },
                additionalProperties: false,
                title: "Team",
              },
            ],
          },
        },
        requested_teams: {
          type: "array",
          items: {
            $schema: "http://json-schema.org/draft-07/schema",
            description:
              "Groups of organization members that gives permissions on specified repositories.",
            type: "object",
            required: [
              "name",
              "id",
              "node_id",
              "slug",
              "description",
              "privacy",
              "url",
              "html_url",
              "members_url",
              "repositories_url",
              "permission",
            ],
            properties: {
              name: {
                type: "string",
                description: "Name of the team",
              },
              id: {
                type: "integer",
                description: "Unique identifier of the team",
              },
              node_id: {
                type: "string",
              },
              slug: {
                type: "string",
              },
              description: {
                type: ["string", "null"],
                description: "Description of the team",
              },
              privacy: {
                type: "string",
                enum: ["open", "closed", "secret"],
              },
              url: {
                type: "string",
                format: "uri",
                description: "URL for the team",
              },
              html_url: {
                type: "string",
                format: "uri",
              },
              members_url: {
                type: "string",
                format: "uri-template",
              },
              repositories_url: {
                type: "string",
                format: "uri",
              },
              permission: {
                type: "string",
                description:
                  "Permission that the team will have for its repositories",
              },
              parent: {
                type: ["object", "null"],
                required: [
                  "name",
                  "id",
                  "node_id",
                  "slug",
                  "description",
                  "privacy",
                  "url",
                  "html_url",
                  "members_url",
                  "repositories_url",
                  "permission",
                ],
                properties: {
                  name: {
                    type: "string",
                    description: "Name of the team",
                  },
                  id: {
                    type: "integer",
                    description: "Unique identifier of the team",
                  },
                  node_id: {
                    type: "string",
                  },
                  slug: {
                    type: "string",
                  },
                  description: {
                    type: ["string", "null"],
                    description: "Description of the team",
                  },
                  privacy: {
                    type: "string",
                    enum: ["open", "closed", "secret"],
                  },
                  url: {
                    type: "string",
                    format: "uri",
                    description: "URL for the team",
                  },
                  html_url: {
                    type: "string",
                    format: "uri",
                  },
                  members_url: {
                    type: "string",
                    format: "uri-template",
                  },
                  repositories_url: {
                    type: "string",
                    format: "uri",
                  },
                  permission: {
                    type: "string",
                    description:
                      "Permission that the team will have for its repositories",
                  },
                  notification_setting: {
                    type: "string",
                    enum: ["notifications_enabled", "notifications_disabled"],
                    description:
                      "Whether team members will receive notifications when their team is @mentioned",
                  },
                },
                additionalProperties: false,
              },
              notification_setting: {
                type: "string",
                enum: ["notifications_enabled", "notifications_disabled"],
                description:
                  "Whether team members will receive notifications when their team is @mentioned",
              },
            },
            additionalProperties: false,
            title: "Team",
          },
        },
        labels: {
          type: "array",
          items: {
            $ref: "#/definitions/label",
          },
        },
        milestone: {
          oneOf: [
            {
              $ref: "#/definitions/milestone",
            },
            {
              type: "null",
            },
          ],
        },
        draft: {
          type: "boolean",
        },
        commits_url: {
          type: "string",
          format: "uri",
        },
        review_comments_url: {
          type: "string",
          format: "uri",
        },
        review_comment_url: {
          type: "string",
          format: "uri-template",
        },
        comments_url: {
          type: "string",
          format: "uri",
        },
        statuses_url: {
          type: "string",
          format: "uri",
        },
        head: {
          type: "object",
          required: ["label", "ref", "sha", "user", "repo"],
          properties: {
            label: {
              type: "string",
            },
            ref: {
              type: "string",
            },
            sha: {
              type: "string",
            },
            user: {
              $schema: "http://json-schema.org/draft-07/schema",
              type: "object",
              required: [
                "login",
                "id",
                "node_id",
                "avatar_url",
                "gravatar_id",
                "url",
                "html_url",
                "followers_url",
                "following_url",
                "gists_url",
                "starred_url",
                "subscriptions_url",
                "organizations_url",
                "repos_url",
                "events_url",
                "received_events_url",
                "type",
                "site_admin",
              ],
              properties: {
                login: {
                  type: "string",
                },
                id: {
                  type: "integer",
                },
                node_id: {
                  type: "string",
                },
                name: {
                  type: "string",
                },
                email: {
                  type: ["string", "null"],
                },
                avatar_url: {
                  type: "string",
                  format: "uri",
                },
                gravatar_id: {
                  type: "string",
                },
                url: {
                  type: "string",
                  format: "uri",
                },
                html_url: {
                  type: "string",
                  format: "uri",
                },
                followers_url: {
                  type: "string",
                  format: "uri",
                },
                following_url: {
                  type: "string",
                  format: "uri-template",
                },
                gists_url: {
                  type: "string",
                  format: "uri-template",
                },
                starred_url: {
                  type: "string",
                  format: "uri-template",
                },
                subscriptions_url: {
                  type: "string",
                  format: "uri",
                },
                organizations_url: {
                  type: "string",
                  format: "uri",
                },
                repos_url: {
                  type: "string",
                  format: "uri",
                },
                events_url: {
                  type: "string",
                  format: "uri-template",
                },
                received_events_url: {
                  type: "string",
                  format: "uri",
                },
                type: {
                  type: "string",
                  enum: ["Bot", "User", "Organization"],
                },
                site_admin: {
                  type: "boolean",
                },
              },
              additionalProperties: false,
              title: "User",
            },
            repo: {
              $ref: "#/definitions/repository",
            },
          },
          additionalProperties: false,
        },
        base: {
          type: "object",
          required: ["label", "ref", "sha", "user", "repo"],
          properties: {
            label: {
              type: "string",
            },
            ref: {
              type: "string",
            },
            sha: {
              type: "string",
            },
            user: {
              $schema: "http://json-schema.org/draft-07/schema",
              type: "object",
              required: [
                "login",
                "id",
                "node_id",
                "avatar_url",
                "gravatar_id",
                "url",
                "html_url",
                "followers_url",
                "following_url",
                "gists_url",
                "starred_url",
                "subscriptions_url",
                "organizations_url",
                "repos_url",
                "events_url",
                "received_events_url",
                "type",
                "site_admin",
              ],
              properties: {
                login: {
                  type: "string",
                },
                id: {
                  type: "integer",
                },
                node_id: {
                  type: "string",
                },
                name: {
                  type: "string",
                },
                email: {
                  type: ["string", "null"],
                },
                avatar_url: {
                  type: "string",
                  format: "uri",
                },
                gravatar_id: {
                  type: "string",
                },
                url: {
                  type: "string",
                  format: "uri",
                },
                html_url: {
                  type: "string",
                  format: "uri",
                },
                followers_url: {
                  type: "string",
                  format: "uri",
                },
                following_url: {
                  type: "string",
                  format: "uri-template",
                },
                gists_url: {
                  type: "string",
                  format: "uri-template",
                },
                starred_url: {
                  type: "string",
                  format: "uri-template",
                },
                subscriptions_url: {
                  type: "string",
                  format: "uri",
                },
                organizations_url: {
                  type: "string",
                  format: "uri",
                },
                repos_url: {
                  type: "string",
                  format: "uri",
                },
                events_url: {
                  type: "string",
                  format: "uri-template",
                },
                received_events_url: {
                  type: "string",
                  format: "uri",
                },
                type: {
                  type: "string",
                  enum: ["Bot", "User", "Organization"],
                },
                site_admin: {
                  type: "boolean",
                },
              },
              additionalProperties: false,
              title: "User",
            },
            repo: {
              $ref: "#/definitions/repository",
            },
          },
          additionalProperties: false,
        },
        author_association: {
          $ref: "#/definitions/author_association",
        },
        auto_merge: {
          oneOf: [
            {
              $ref: "#/definitions/auto-merge",
            },
            {
              type: "null",
            },
          ],
        },
        active_lock_reason: {
          type: ["string", "null"],
          enum: ["resolved", "off-topic", "too heated", "spam", null],
        },
      },
      additionalProperties: false,
      title: "Simple Pull Request",
    },
    repository: {
      $ref: "#/definitions/repository",
      description: "The repository containing the pull request",
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
    sender: {
      $schema: "http://json-schema.org/draft-07/schema",
      type: "object",
      required: [
        "login",
        "id",
        "node_id",
        "avatar_url",
        "gravatar_id",
        "url",
        "html_url",
        "followers_url",
        "following_url",
        "gists_url",
        "starred_url",
        "subscriptions_url",
        "organizations_url",
        "repos_url",
        "events_url",
        "received_events_url",
        "type",
        "site_admin",
      ],
      properties: {
        login: {
          type: "string",
        },
        id: {
          type: "integer",
        },
        node_id: {
          type: "string",
        },
        name: {
          type: "string",
        },
        email: {
          type: ["string", "null"],
        },
        avatar_url: {
          type: "string",
          format: "uri",
        },
        gravatar_id: {
          type: "string",
        },
        url: {
          type: "string",
          format: "uri",
        },
        html_url: {
          type: "string",
          format: "uri",
        },
        followers_url: {
          type: "string",
          format: "uri",
        },
        following_url: {
          type: "string",
          format: "uri-template",
        },
        gists_url: {
          type: "string",
          format: "uri-template",
        },
        starred_url: {
          type: "string",
          format: "uri-template",
        },
        subscriptions_url: {
          type: "string",
          format: "uri",
        },
        organizations_url: {
          type: "string",
          format: "uri",
        },
        repos_url: {
          type: "string",
          format: "uri",
        },
        events_url: {
          type: "string",
          format: "uri-template",
        },
        received_events_url: {
          type: "string",
          format: "uri",
        },
        type: {
          type: "string",
          enum: ["Bot", "User", "Organization"],
        },
        site_admin: {
          type: "boolean",
        },
      },
      additionalProperties: false,
      title: "User",
    },
  },
  additionalProperties: false,
  if: {
    properties: {
      action: {
        const: "edited",
      },
    },
  },
  then: {
    required: [
      "action",
      "changes",
      "review",
      "pull_request",
      "repository",
      "sender",
    ],
  },
};

export const prReviewExample = {};
