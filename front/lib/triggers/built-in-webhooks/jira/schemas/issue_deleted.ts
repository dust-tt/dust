import type { JSONSchema7 as JSONSchema } from "json-schema";

export const issueDeletedSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema",
  type: "object",
  title: "jira:issue_deleted event",
  required: [
    "timestamp",
    "webhookEvent",
    "issue_event_type_name",
    "user",
    "issue",
  ],
  properties: {
    timestamp: {
      type: "integer",
      description: "UTC milliseconds from epoch",
    },
    webhookEvent: {
      type: "string",
      const: "jira:issue_deleted",
      description: "The webhook event identifier",
    },
    issue_event_type_name: {
      type: "string",
      description:
        "The Jira event type that triggered this webhook (e.g., 'issue_deleted')",
    },
    user: {
      type: "object",
      description: "The user who triggered the event",
      required: [
        "self",
        "accountId",
        "displayName",
        "active",
        "timeZone",
        "accountType",
      ],
      properties: {
        self: {
          type: "string",
          format: "uri",
        },
        accountId: {
          type: "string",
        },
        displayName: {
          type: "string",
        },
        emailAddress: {
          type: "string",
          format: "email",
        },
        avatarUrls: {
          type: "object",
          properties: {
            "16x16": { type: "string", format: "uri" },
            "24x24": { type: "string", format: "uri" },
            "32x32": { type: "string", format: "uri" },
            "48x48": { type: "string", format: "uri" },
          },
        },
        active: {
          type: "boolean",
        },
        timeZone: {
          type: "string",
        },
        accountType: {
          type: "string",
          enum: ["atlassian", "app", "customer"],
          description: "Type of user account",
        },
      },
    },
    issue: {
      type: "object",
      description: "The Jira issue that was created",
      properties: {
        id: {
          type: "string",
          description: "Unique identifier of the issue",
        },
        self: {
          type: "string",
          description: "URL of the issue",
        },
        key: {
          type: "string",
          description: "Issue key (e.g., PROJECT-123)",
        },
        fields: {
          type: "object",
          description: "Issue fields",
          properties: {
            summary: {
              type: "string",
              description: "Summary/title of the issue",
            },
            description: {
              type: ["string", "object", "null"],
              description: "Description of the issue",
            },
            created: {
              type: "string",
              description: "ISO 8601 timestamp when issue was created",
            },
            updated: {
              type: "string",
              description: "ISO 8601 timestamp when issue was last updated",
            },
            status: {
              type: "object",
              description: "Current status of the issue",
              properties: {
                self: { type: "string" },
                description: { type: "string" },
                name: { type: "string" },
                id: { type: "string" },
                statusCategory: {
                  type: "object",
                  properties: {
                    self: { type: "string" },
                    id: { type: "integer" },
                    key: { type: "string" },
                    name: { type: "string" },
                  },
                },
              },
            },
            priority: {
              type: "object",
              description: "Priority of the issue",
              properties: {
                self: { type: "string" },
                name: { type: "string" },
                id: { type: "string" },
              },
            },
            issuetype: {
              type: "object",
              description: "Type of the issue",
              properties: {
                self: { type: "string" },
                id: { type: "string" },
                description: { type: "string" },
                name: { type: "string" },
                subtask: { type: "boolean" },
              },
            },
            project: {
              type: "object",
              description: "Project the issue belongs to",
              properties: {
                self: { type: "string" },
                id: { type: "string" },
                key: { type: "string" },
                name: { type: "string" },
              },
            },
            creator: {
              type: "object",
              description: "User who created the issue",
              properties: {
                self: { type: "string" },
                accountId: { type: "string" },
                displayName: { type: "string" },
                active: { type: "boolean" },
              },
            },
            reporter: {
              type: "object",
              description: "User who reported the issue",
              properties: {
                self: { type: "string" },
                accountId: { type: "string" },
                displayName: { type: "string" },
                active: { type: "boolean" },
              },
            },
            assignee: {
              type: ["object", "null"],
              description: "User assigned to the issue",
              properties: {
                self: { type: "string" },
                accountId: { type: "string" },
                displayName: { type: "string" },
                active: { type: "boolean" },
              },
            },
            labels: {
              type: "array",
              description: "Labels attached to the issue",
              items: {
                type: "string",
              },
            },
          },
        },
      },
      required: ["id", "key", "fields"],
    },
    matchedWebhookIds: {
      type: "array",
      items: {
        type: "integer",
      },
      description:
        "IDs of webhooks that matched this event (for REST API registered webhooks)",
    },
  },
};

export const issueDeletedExample = {
  timestamp: 1736938200000,
  webhookEvent: "jira:issue_deleted",
  issue_event_type_name: "issue_deleted",
  user: {
    self: "https://example.atlassian.net/rest/api/2/user?accountId=000000%3A00000000-0000-0000-0000-000000000000",
    accountId: "000000:00000000-0000-0000-0000-000000000000",
    avatarUrls: {
      "48x48":
        "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
      "24x24":
        "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
      "16x16":
        "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
      "32x32":
        "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
    },
    displayName: "User",
    active: true,
    timeZone: "UTC",
    accountType: "atlassian",
  },
  issue: {
    id: "10001",
    self: "https://example.atlassian.net/rest/api/2/10001",
    key: "PROJ-1",
    fields: {
      statuscategorychangedate: "2025-01-15T10:30:00.000+0000",
      issuetype: {
        self: "https://example.atlassian.net/rest/api/2/issuetype/10001",
        id: "10001",
        description: "Tasks track small, distinct pieces of work.",
        iconUrl:
          "https://example.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001?size=medium",
        name: "Task",
        subtask: false,
        avatarId: 10001,
        entityId: "00000000-0000-0000-0000-000000000000",
        hierarchyLevel: 0,
      },
      components: [],
      timespent: null,
      timeoriginalestimate: null,
      project: {
        self: "https://example.atlassian.net/rest/api/2/project/10001",
        id: "10001",
        key: "PROJ",
        name: "Example Project",
        projectTypeKey: "software",
        simplified: true,
        avatarUrls: {
          "48x48":
            "https://example.atlassian.net/rest/api/2/universal_avatar/view/type/project/avatar/10001",
          "24x24":
            "https://example.atlassian.net/rest/api/2/universal_avatar/view/type/project/avatar/10001?size=small",
          "16x16":
            "https://example.atlassian.net/rest/api/2/universal_avatar/view/type/project/avatar/10001?size=xsmall",
          "32x32":
            "https://example.atlassian.net/rest/api/2/universal_avatar/view/type/project/avatar/10001?size=medium",
        },
      },
      description: null,
      fixVersions: [],
      statusCategory: {
        self: "https://example.atlassian.net/rest/api/2/statuscategory/2",
        id: 2,
        key: "new",
        colorName: "blue-gray",
        name: "New",
      },
      aggregatetimespent: null,
      resolution: null,
      timetracking: {},
      customfield_10015: null,
      security: null,
      attachment: [],
      aggregatetimeestimate: null,
      resolutiondate: null,
      workratio: -1,
      summary: "Example issue summary",
      issuerestriction: {
        issuerestrictions: {},
        shouldDisplay: true,
      },
      watches: {
        self: "https://example.atlassian.net/rest/api/2/issue/PROJ-1/watchers",
        watchCount: 0,
        isWatching: true,
      },
      lastViewed: "2025-01-15T11:30:00.000+0000",
      creator: {
        self: "https://example.atlassian.net/rest/api/2/user?accountId=000000%3A00000000-0000-0000-0000-000000000000",
        accountId: "000000:00000000-0000-0000-0000-000000000000",
        avatarUrls: {
          "48x48":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
          "24x24":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
          "16x16":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
          "32x32":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
        },
        displayName: "User",
        active: true,
        timeZone: "UTC",
        accountType: "atlassian",
      },
      subtasks: [],
      created: "2025-01-15T10:30:00.000+0000",
      reporter: {
        self: "https://example.atlassian.net/rest/api/2/user?accountId=000000%3A00000000-0000-0000-0000-000000000000",
        accountId: "000000:00000000-0000-0000-0000-000000000000",
        avatarUrls: {
          "48x48":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
          "24x24":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
          "16x16":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
          "32x32":
            "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FU-0.png",
        },
        displayName: "User",
        active: true,
        timeZone: "UTC",
        accountType: "atlassian",
      },
      customfield_10021: null,
      aggregateprogress: {
        progress: 0,
        total: 0,
      },
      priority: {
        self: "https://example.atlassian.net/rest/api/2/priority/3",
        iconUrl:
          "https://example.atlassian.net/images/icons/priorities/medium_new.svg",
        name: "Medium",
        id: "3",
      },
      customfield_10001: null,
      labels: [],
      environment: null,
      customfield_10019: "0|i000pr:",
      timeestimate: null,
      aggregatetimeoriginalestimate: null,
      versions: [],
      duedate: null,
      progress: {
        progress: 0,
        total: 0,
      },
      votes: {
        self: "https://example.atlassian.net/rest/api/2/issue/PROJ-1/votes",
        votes: 0,
        hasVoted: false,
      },
      issuelinks: [],
      assignee: null,
      updated: "2025-01-15T10:30:00.000+0000",
      status: {
        self: "https://example.atlassian.net/rest/api/2/status/10001",
        description: "",
        iconUrl: "https://example.atlassian.net/",
        name: "To Do",
        id: "10001",
        statusCategory: {
          self: "https://example.atlassian.net/rest/api/2/statuscategory/2",
          id: 2,
          key: "new",
          colorName: "blue-gray",
          name: "New",
        },
      },
    },
  },
  matchedWebhookIds: [1],
};
