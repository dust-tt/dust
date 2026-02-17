import { JIRA_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import {
  ADFDocumentSchema,
  JiraCreateIssueLinkRequestSchema,
  JiraCreateIssueRequestSchema,
  JiraSearchFilterSchema,
  JiraSortSchema,
  SEARCH_USERS_MAX_RESULTS,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const JIRA_TOOL_NAME = "jira" as const;

export const JIRA_TOOLS_METADATA = createToolsRecord({
  // Read operations
  get_issue_read_fields: {
    description:
      "Lists available Jira field keys/ids and names for use in the get_issue.fields parameter (read-time).",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Jira issue fields",
      done: "List Jira issue fields",
    },
  },
  get_issue: {
    description: "Retrieves a single JIRA issue by its key (e.g., 'PROJ-123').",
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
    description: "Retrieves a list of JIRA projects.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Jira projects",
      done: "List Jira projects",
    },
  },
  get_project: {
    description: "Retrieves a single JIRA project by its key (e.g., 'PROJ').",
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
      "Gets available transitions for a JIRA issue based on its current status and workflow.",
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
      "Search issues using one or more filters (e.g., status, priority, labels, assignee, fixVersion, customField, dueDate, created, resolved). Use exact matching by default, or fuzzy matching for approximate/partial matches on summary field. For custom fields, use field 'customField' with customFieldName parameter. For date fields (dueDate, created, resolved), use operator parameter with '<', '>', '=', etc. and date format '2023-07-03' or relative '-25d', '7d', '2w', '1M', etc. Results can be sorted using the sortBy parameter with field and direction (ASC/DESC). When referring to the user, use the get_connection_info tool. When referring to unknown create/update fields, use get_issue_create_fields or get_issue_types to discover the field names.",
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
      "Search JIRA issues using a custom JQL (Jira Query Language) query. This tool allows for advanced search capabilities beyond the filtered search. Examples: 'project = PROJ AND status = Open', 'assignee = currentUser() AND priority = High', 'created >= -30d AND labels = bug'.",
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
      "Create/update-time field metadata for a specific project and issue type. Returns only fields available on the Create/Update screens (subset). Use get_issue_types to get the issue type ID.",
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
      "Gets comprehensive connection information including user details, cloud ID, and site URL for the currently authenticated JIRA instance. This tool is used when the user is referring about themselves",
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
    description:
      "Search for JIRA users. Provide emailAddress for exact email match, or name for display name contains. If neither is provided, returns the first maxResults users. Use startAt for pagination (pass the previous result's nextStartAt).",
    schema: {
      emailAddress: z
        .string()
        .optional()
        .describe(
          "Exact email address (e.g., 'john.doe@company.com'). If provided, only exact matches are returned."
        ),
      name: z
        .string()
        .optional()
        .describe(
          "Display name filter (e.g., 'John Doe'). Case-insensitive contains match."
        ),
      maxResults: z
        .number()
        .min(1)
        .max(SEARCH_USERS_MAX_RESULTS)
        .optional()
        .default(SEARCH_USERS_MAX_RESULTS)
        .describe(
          `Maximum number of users to return when searching by name (default: ${SEARCH_USERS_MAX_RESULTS}, max: ${SEARCH_USERS_MAX_RESULTS})`
        ),
      startAt: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Pagination offset. Pass the previous response's nextStartAt to fetch the next page."
        ),
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
      "Read content from any attachment on a Jira issue. For text-based files (PDF, Word, Excel, CSV, plain text), extracts and returns the text content. For other files (images, documents), returns the file for upload. Supports text extraction with OCR for scanned documents.",
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
      "Adds a comment to an existing JIRA issue. Accepts either plain text string or rich Atlassian Document Format (ADF).",
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
      "Transitions a JIRA issue to a different status/workflow state.",
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
      "Creates a new JIRA issue with the specified details. For textarea fields (like description), you can use either plain text or rich ADF format. Note: Available fields vary by project and issue type. Use get_issue_create_fields to check which fields are required and available.",
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
      "Updates an existing JIRA issue with new field values (e.g., summary, description, priority, assignee). For textarea fields (like description), you can use either plain text or rich ADF format. Use get_issue_create_fields to identify textarea fields. Note: Issue links, attachments, and some system fields require separate APIs and are not supported.",
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
      "Creates a link between two JIRA issues with a specified relationship type (e.g., 'Blocks', 'Relates', 'Duplicates').",
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
      "Upload a file attachment to a Jira issue. Supports two types of file sources: conversation files (from current Dust conversation) and external files (base64 encoded). The attachment must specify its type and corresponding fields. IMPORTANT: The 'type' field must be exactly 'conversation_file' or 'external_file', not a MIME type like 'image/png'.",
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
              "The fileId from conversation attachments (use conversation_list_files to get available files)"
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
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
    instructions: JIRA_SERVER_INSTRUCTIONS,
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
