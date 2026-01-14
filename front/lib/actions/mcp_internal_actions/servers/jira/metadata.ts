import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { JIRA_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import {
  ADFDocumentSchema,
  JiraCreateIssueLinkRequestSchema,
  JiraCreateIssueRequestSchema,
  JiraSearchFilterSchema,
  JiraSortSchema,
  SEARCH_USERS_MAX_RESULTS,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// Re-export for use in server.ts
export { SEARCH_USERS_MAX_RESULTS };

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const JIRA_TOOL_NAME = "jira" as const;

export const getIssueReadFieldsSchema = {};

export const getIssueSchema = {
  issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of fields to include. Defaults to a minimal set for performance."
    ),
};

export const getProjectsSchema = {};

export const getProjectSchema = {
  projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
};

export const getProjectVersionsSchema = {
  projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
};

export const getTransitionsSchema = {
  issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
};

export const createCommentSchema = {
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
};

export const getIssuesSchema = {
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
};

export const getIssuesUsingJqlSchema = {
  jql: z.string().describe("The JQL (Jira Query Language) query string"),
  maxResults: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of results to return (default: 50, max: 100)"),
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
};

export const getIssueTypesSchema = {
  projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
};

export const getIssueCreateFieldsSchema = {
  projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
  issueTypeId: z
    .string()
    .describe("The issue type ID to get fields for (required)"),
};

export const getConnectionInfoSchema = {};

export const transitionIssueSchema = {
  issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
  transitionId: z.string().describe("The ID of the transition to perform"),
};

export const createIssueSchema = {
  issueData: JiraCreateIssueRequestSchema.describe(
    "The description of the issue"
  ),
};

export const updateIssueSchema = {
  issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
  updateData: JiraCreateIssueRequestSchema.partial().describe(
    "The partial data to update the issue with - description field supports both plain text and ADF format"
  ),
};

export const createIssueLinkSchema = {
  linkData: JiraCreateIssueLinkRequestSchema.describe(
    "Link configuration including type and issues to link"
  ),
};

export const deleteIssueLinkSchema = {
  linkId: z.string().describe("The ID of the issue link to delete"),
};

export const getIssueLinkTypesSchema = {};

export const getUsersSchema = {
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
};

export const uploadAttachmentSchema = {
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
};

export const getAttachmentsSchema = {
  issueKey: z.string().describe("The Jira issue key (e.g., 'PROJ-123')"),
};

export const readAttachmentSchema = {
  issueKey: z.string().describe("The Jira issue key (e.g., 'PROJ-123')"),
  attachmentId: z.string().describe("The ID of the attachment to read"),
};

export const JIRA_TOOLS: MCPToolType[] = [
  {
    name: "get_issue_read_fields",
    description:
      "Lists available Jira field keys/ids and names for use in the get_issue.fields parameter (read-time).",
    inputSchema: zodToJsonSchema(
      z.object(getIssueReadFieldsSchema)
    ) as JSONSchema,
  },
  {
    name: "get_issue",
    description: "Retrieves a single JIRA issue by its key (e.g., 'PROJ-123').",
    inputSchema: zodToJsonSchema(z.object(getIssueSchema)) as JSONSchema,
  },
  {
    name: "get_projects",
    description: "Retrieves a list of JIRA projects.",
    inputSchema: zodToJsonSchema(z.object(getProjectsSchema)) as JSONSchema,
  },
  {
    name: "get_project",
    description: "Retrieves a single JIRA project by its key (e.g., 'PROJ').",
    inputSchema: zodToJsonSchema(z.object(getProjectSchema)) as JSONSchema,
  },
  {
    name: "get_project_versions",
    description:
      "Retrieves all versions (releases) for a JIRA project. Useful for getting release reports and understanding which versions are available for filtering issues.",
    inputSchema: zodToJsonSchema(
      z.object(getProjectVersionsSchema)
    ) as JSONSchema,
  },
  {
    name: "get_transitions",
    description:
      "Gets available transitions for a JIRA issue based on its current status and workflow.",
    inputSchema: zodToJsonSchema(z.object(getTransitionsSchema)) as JSONSchema,
  },
  {
    name: "create_comment",
    description:
      "Adds a comment to an existing JIRA issue. Accepts either plain text string or rich Atlassian Document Format (ADF).",
    inputSchema: zodToJsonSchema(z.object(createCommentSchema)) as JSONSchema,
  },
  {
    name: "get_issues",
    description:
      "Search issues using one or more filters (e.g., status, priority, labels, assignee, fixVersion, customField, dueDate, created, resolved). Use exact matching by default, or fuzzy matching for approximate/partial matches on summary field. For custom fields, use field 'customField' with customFieldName parameter. For date fields (dueDate, created, resolved), use operator parameter with '<', '>', '=', etc. and date format '2023-07-03' or relative '-25d', '7d', '2w', '1M', etc. Results can be sorted using the sortBy parameter with field and direction (ASC/DESC). When referring to the user, use the get_connection_info tool. When referring to unknown create/update fields, use get_issue_create_fields or get_issue_types to discover the field names.",
    inputSchema: zodToJsonSchema(z.object(getIssuesSchema)) as JSONSchema,
  },
  {
    name: "get_issues_using_jql",
    description:
      "Search JIRA issues using a custom JQL (Jira Query Language) query. This tool allows for advanced search capabilities beyond the filtered search. Examples: 'project = PROJ AND status = Open', 'assignee = currentUser() AND priority = High', 'created >= -30d AND labels = bug'.",
    inputSchema: zodToJsonSchema(
      z.object(getIssuesUsingJqlSchema)
    ) as JSONSchema,
  },
  {
    name: "get_issue_types",
    description: "Retrieves available issue types for a JIRA project.",
    inputSchema: zodToJsonSchema(z.object(getIssueTypesSchema)) as JSONSchema,
  },
  {
    name: "get_issue_create_fields",
    description:
      "Create/update-time field metadata for a specific project and issue type. Returns only fields available on the Create/Update screens (subset). Use get_issue_types to get the issue type ID.",
    inputSchema: zodToJsonSchema(
      z.object(getIssueCreateFieldsSchema)
    ) as JSONSchema,
  },
  {
    name: "get_connection_info",
    description:
      "Gets comprehensive connection information including user details, cloud ID, and site URL for the currently authenticated JIRA instance. This tool is used when the user is referring about themselves",
    inputSchema: zodToJsonSchema(
      z.object(getConnectionInfoSchema)
    ) as JSONSchema,
  },
  {
    name: "transition_issue",
    description:
      "Transitions a JIRA issue to a different status/workflow state.",
    inputSchema: zodToJsonSchema(z.object(transitionIssueSchema)) as JSONSchema,
  },
  {
    name: "create_issue",
    description:
      "Creates a new JIRA issue with the specified details. For textarea fields (like description), you can use either plain text or rich ADF format. Note: Available fields vary by project and issue type. Use get_issue_create_fields to check which fields are required and available.",
    inputSchema: zodToJsonSchema(z.object(createIssueSchema)) as JSONSchema,
  },
  {
    name: "update_issue",
    description:
      "Updates an existing JIRA issue with new field values (e.g., summary, description, priority, assignee). For textarea fields (like description), you can use either plain text or rich ADF format. Use get_issue_create_fields to identify textarea fields. Note: Issue links, attachments, and some system fields require separate APIs and are not supported.",
    inputSchema: zodToJsonSchema(z.object(updateIssueSchema)) as JSONSchema,
  },
  {
    name: "create_issue_link",
    description:
      "Creates a link between two JIRA issues with a specified relationship type (e.g., 'Blocks', 'Relates', 'Duplicates').",
    inputSchema: zodToJsonSchema(z.object(createIssueLinkSchema)) as JSONSchema,
  },
  {
    name: "delete_issue_link",
    description: "Deletes an existing link between JIRA issues.",
    inputSchema: zodToJsonSchema(z.object(deleteIssueLinkSchema)) as JSONSchema,
  },
  {
    name: "get_issue_link_types",
    description:
      "Retrieves all available issue link types that can be used when creating issue links.",
    inputSchema: zodToJsonSchema(
      z.object(getIssueLinkTypesSchema)
    ) as JSONSchema,
  },
  {
    name: "get_users",
    description:
      "Search for JIRA users. Provide emailAddress for exact email match, or name for display name contains. If neither is provided, returns the first maxResults users. Use startAt for pagination (pass the previous result's nextStartAt).",
    inputSchema: zodToJsonSchema(z.object(getUsersSchema)) as JSONSchema,
  },
  {
    name: "upload_attachment",
    description:
      "Upload a file attachment to a Jira issue. Supports two types of file sources: conversation files (from current Dust conversation) and external files (base64 encoded). The attachment must specify its type and corresponding fields. IMPORTANT: The 'type' field must be exactly 'conversation_file' or 'external_file', not a MIME type like 'image/png'.",
    inputSchema: zodToJsonSchema(
      z.object(uploadAttachmentSchema)
    ) as JSONSchema,
  },
  {
    name: "get_attachments",
    description:
      "Retrieve all attachments for a Jira issue, including metadata like filename, size, MIME type, and download URLs.",
    inputSchema: zodToJsonSchema(z.object(getAttachmentsSchema)) as JSONSchema,
  },
  {
    name: "read_attachment",
    description:
      "Read content from any attachment on a Jira issue. For text-based files (PDF, Word, Excel, CSV, plain text), extracts and returns the text content. For other files (images, documents), returns the file for upload. Supports text extraction with OCR for scanned documents.",
    inputSchema: zodToJsonSchema(z.object(readAttachmentSchema)) as JSONSchema,
  },
];

export const JIRA_SERVER_INFO = {
  name: "jira" as const,
  version: "1.0.0",
  description: "Create, update and track project issues.",
  authorization: {
    provider: "jira" as const,
    supported_use_cases: [
      "platform_actions",
      "personal_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "JiraLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/jira",
  instructions: JIRA_SERVER_INSTRUCTIONS,
};

export const JIRA_TOOL_STAKES = {
  // Read operations - never ask (no side effects)
  get_issue: "never_ask",
  get_projects: "never_ask",
  get_project: "never_ask",
  get_project_versions: "never_ask",
  get_transitions: "never_ask",
  get_issues: "never_ask",
  get_issues_using_jql: "never_ask",
  get_issue_types: "never_ask",
  get_issue_create_fields: "never_ask",
  get_issue_read_fields: "never_ask",
  get_connection_info: "never_ask",
  get_issue_link_types: "never_ask",
  get_users: "never_ask",
  get_attachments: "never_ask",
  read_attachment: "never_ask",

  // Update operations - low stakes
  create_comment: "low",
  transition_issue: "low",
  create_issue: "low",
  update_issue: "low",
  create_issue_link: "low",
  delete_issue_link: "low",
  upload_attachment: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;
