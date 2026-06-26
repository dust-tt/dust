import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  ADFDocumentSchema,
  JiraCreateIssueLinkRequestSchema,
  JiraCreateIssueRequestSchema,
  JiraSearchFilterSchema,
  JiraSortSchema,
  SEARCH_USERS_MAX_RESULTS,
} from "@app/lib/api/actions/servers/jira/types";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const JIRA_TOOLS_METADATA = createToolsRecord({
  // Read operations
  get_issue_read_fields: {
    description:
      "Lists the field keys, ids, and names that can be requested when reading an issue.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Jira issue fields",
      done: "List Jira issue fields",
    },
  },
  get_issue: {
    description:
      "Looks up and retrieves a single Jira issue (ticket) by its key (e.g., 'PROJ-123'). Returns a minimal set of fields by default. Pass the fields parameter to request others.",
    schema: {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of fields to include. Defaults to a minimal set for performance."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira issue",
      done: "Retrieve Jira issue",
    },
  },
  get_projects: {
    description: "Retrieves all Jira projects (the full list).",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Jira projects",
      done: "List Jira projects",
    },
  },
  get_project: {
    description: "Retrieves a single Jira project by its key (e.g., 'PROJ').",
    schema: {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira project",
      done: "Retrieve Jira project",
    },
  },
  get_project_versions: {
    description:
      "Retrieves all versions (releases) for a JIRA project. Useful for getting release reports and understanding which versions are available for filtering issues.",
    schema: {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira project versions",
      done: "Retrieve Jira project versions",
    },
  },
  get_transitions: {
    description:
      "Lists which status changes a Jira issue is currently allowed to make.",
    schema: {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira transitions",
      done: "Retrieve Jira transitions",
    },
  },
  get_issues: {
    description:
      "Search or list Jira issues (tickets, bugs) by filters: status (open, in progress, done), priority, labels, who they are assigned to, fixVersion, or dates. Supports fuzzy matching and sorting. Use it to browse the backlog or find issues by criteria.",
    schema: {
      filters: z
        .array(JiraSearchFilterSchema)
        .min(1)
        .describe("Array of search filters to apply (all must match)"),
      sortBy: JiraSortSchema.optional().describe(
        "Optional sorting configuration for results"
      ),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for next page of results (for pagination)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Jira issues",
      done: "Search Jira issues",
    },
  },
  get_issues_using_jql: {
    description:
      "Search Jira issues using a raw JQL (Jira Query Language) query string. Use only when you already have a JQL expression.",
    schema: {
      jql: z.string().describe("The JQL (Jira Query Language) query string"),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Maximum number of results to return (default: 50, max: 100)"
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of fields to include in the response. Defaults to ['summary']"
        ),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for next page of results (for pagination)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Jira issues with JQL",
      done: "Search Jira issues with JQL",
    },
  },
  get_issue_types: {
    description: "Retrieves available issue types for a JIRA project.",
    schema: {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira issue types",
      done: "Retrieve Jira issue types",
    },
  },
  get_issue_create_fields: {
    description:
      "Lists the field metadata (names and ids) on the screens used to create or update an issue, for a given project and issue type. Use it to discover valid field names beforehand.",
    schema: {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
      issueTypeId: z
        .string()
        .describe("The issue type ID to get fields for (required)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira create fields",
      done: "Retrieve Jira create fields",
    },
  },
  get_connection_info: {
    description:
      "Gets comprehensive connection information including user details, cloud ID, and site URL for the currently authenticated JIRA instance. This tool is used when the user is referring about themselves. Also use it to authenticate when another tool reports that no access token was found.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira connection info",
      done: "Retrieve Jira connection info",
    },
  },
  get_issue_link_types: {
    description:
      "Retrieves all available issue link types that can be used when creating issue links.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira link types",
      done: "Retrieve Jira link types",
    },
  },
  get_users: {
    description: "Search for Jira users by email address or display name.",
    schema: {
      emailAddress: z
        .string()
        .optional()
        .describe("Exact email address to match."),
      name: z
        .string()
        .optional()
        .describe("Display name to match (case-insensitive contains)."),
      maxResults: z
        .number()
        .min(1)
        .max(SEARCH_USERS_MAX_RESULTS)
        .optional()
        .default(SEARCH_USERS_MAX_RESULTS)
        .describe(
          `Maximum number of users to return (default and max: ${SEARCH_USERS_MAX_RESULTS}).`
        ),
      startAt: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Pagination offset (use the previous nextStartAt)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Jira users",
      done: "Search Jira users",
    },
  },
  get_attachments: {
    description:
      "Retrieve all attachments for a Jira issue, including metadata like filename, size, MIME type, and download URLs.",
    schema: {
      issueKey: z.string().describe("The Jira issue key (e.g., 'PROJ-123')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Jira attachments",
      done: "Retrieve Jira attachments",
    },
  },
  read_attachment: {
    description:
      "Read the content of an attachment on a Jira issue. Extracts text from PDF, Word, Excel, CSV, and plain-text files (with OCR for scans). Other files are returned as-is.",
    schema: {
      issueKey: z.string().describe("The Jira issue key (e.g., 'PROJ-123')"),
      attachmentId: z.string().describe("The ID of the attachment to read"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading attachment from Jira",
      done: "Read attachment from Jira",
    },
  },

  // Write operations
  create_comment: {
    description:
      "Adds a comment or note to an existing Jira issue. Accepts plain text or rich ADF formatting.",
    schema: {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      comment: z
        .union([z.string(), ADFDocumentSchema])
        .describe(
          "The comment content - either plain text string or ADF document object for rich formatting"
        ),
      visibilityType: z
        .enum(["group", "role"])
        .optional()
        .describe("Visibility restriction type"),
      visibilityValue: z
        .string()
        .optional()
        .describe("Group or role name for visibility restriction"),
    },
    stake: "low",
    displayLabels: {
      running: "Adding comment on Jira",
      done: "Add comment on Jira",
    },
  },
  transition_issue: {
    description:
      "Moves or changes a Jira issue (ticket) to a different status (e.g. to In Progress or Done). Performs a workflow transition.",
    schema: {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      transitionId: z.string().describe("The ID of the transition to perform"),
    },
    stake: "low",
    displayLabels: {
      running: "Transitioning Jira issue",
      done: "Transition Jira issue",
    },
  },
  create_issue: {
    description:
      "Creates a new Jira issue, or ticket, in a project. Use it to log a bug, raise a request, or open a task or story. Description fields accept plain text or rich ADF. Required fields vary by project and issue type.",
    schema: {
      issueData: JiraCreateIssueRequestSchema.describe(
        "The description of the issue"
      ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Jira issue",
      done: "Create Jira issue",
    },
  },
  update_issue: {
    description:
      "Updates or changes field values on an existing Jira issue, such as its summary, description, priority, or assignee. Description accepts plain text or rich ADF. Issue links and attachments are not changed here.",
    schema: {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      updateData: JiraCreateIssueRequestSchema.partial().describe(
        "The partial data to update the issue with - description field supports both plain text and ADF format"
      ),
    },
    stake: "low",
    displayLabels: {
      running: "Updating Jira issue",
      done: "Update Jira issue",
    },
  },
  create_issue_link: {
    description:
      "Links or marks two Jira issues as related, with a relationship type such as blocks, relates to, or duplicates.",
    schema: {
      linkData: JiraCreateIssueLinkRequestSchema.describe(
        "Link configuration including type and issues to link"
      ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Jira issue link",
      done: "Create Jira issue link",
    },
  },
  delete_issue_link: {
    description: "Deletes an existing link between JIRA issues.",
    schema: {
      linkId: z.string().describe("The ID of the issue link to delete"),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting Jira issue link",
      done: "Delete Jira issue link",
    },
  },
  upload_attachment: {
    description:
      "Attach a file to a Jira issue (upload). The file can come from the current Dust conversation or be provided as base64 data.",
    schema: {
      issueKey: z.string().describe("The Jira issue key (e.g., 'PROJ-123')"),
      attachment: z.union([
        z.object({
          type: z
            .literal("conversation_file")
            .describe("Use this for files already in the Dust conversation"),
          fileId: z
            .string()
            .describe(
              "The file reference from the conversation. Accepts a scoped file path (e.g. 'conversation/report.pdf') or a legacy file sId."
            ),
        }),
        z.object({
          type: z
            .literal("external_file")
            .describe("Use this for new files provided as base64 data"),
          filename: z
            .string()
            .describe(
              "The filename for the attachment (e.g., 'document.pdf', 'image.png')"
            ),
          contentType: z
            .string()
            .describe(
              "MIME type of the file (e.g., 'image/png', 'application/pdf', 'text/plain')"
            ),
          base64Data: z.string().describe("Base64 encoded file data"),
        }),
      ]),
    },
    stake: "low",
    displayLabels: {
      running: "Uploading attachment to Jira",
      done: "Upload attachment to Jira",
    },
  },
});

export const JIRA_SERVER = {
  serverInfo: {
    name: "jira",
    version: "1.0.0",
    description: "Create, update and track project issues.",
    authorization: {
      provider: "jira" as const,
      supported_use_cases: ["platform_actions", "personal_actions"] as const,
    },
    icon: "JiraLogo",
    documentationUrl: "https://docs.dust.tt/docs/jira",
  },
  tools: Object.values(JIRA_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(JIRA_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
