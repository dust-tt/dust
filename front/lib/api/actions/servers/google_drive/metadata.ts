import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { DocumentOperationsArraySchema } from "@app/lib/api/actions/servers/google_drive/resolution/docs_resolver";
import { SpreadsheetOperationsArraySchema } from "@app/lib/api/actions/servers/google_drive/resolution/sheets_resolver";
import { PresentationOperationsArraySchema } from "@app/lib/api/actions/servers/google_drive/resolution/slides_resolver";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SUPPORTED_MIMETYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content
export const MAX_FILE_SIZE = 64 * 1024 * 1024; // 64 MB max original file size

export const GOOGLE_DRIVE_TOOL_NAME = "google_drive" as const;

const capabilitiesSchema = z
  .object({
    canEdit: z.boolean().optional(),
    canComment: z.boolean().optional(),
    canShare: z.boolean().optional(),
    canCopy: z.boolean().optional(),
  })
  .optional()
  .describe(
    "The capabilities object for this file, as returned by search_files or get_file_content. Pass this value if it was returned by a previous tool call."
  );

export const GOOGLE_DRIVE_TOOLS_METADATA = createToolsRecord({
  list_drives: {
    description: "List all shared drives accessible by the user.",
    schema: {
      pageToken: z.string().optional().describe("Page token for pagination."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Google drives",
      done: "List Google drives",
    },
  },
  search_files: {
    description:
      "Search for files in Google Drive. Can search in personal drive, all shared drives, or a specific drive.",
    schema: {
      q: z
        .string()
        .optional()
        .describe(`\
Search query to filter files. Uses Google Drive's search syntax. Leave empty to list all supported files. Examples:
- Files with the name "hello": name = 'hello'
- Files with a name containing the words "hello" and "goodbye": name contains 'hello' and name contains 'goodbye'
- Files with a name that does not contain the word "hello": not name contains 'hello'
- Files that contain the text "important" and in the trash: fullText contains 'important' and trashed = true
- Files that contain the word "hello": fullText contains 'hello'
- Files that don't have the word "hello": not fullText contains 'hello'
- Files that contain the exact phrase "hello world": fullText contains '"hello world"'
- Files with a query that contains the "\\" character (for example, "\\authors"): fullText contains '\\\\authors'
- Files that are folders: mimeType = 'application/vnd.google-apps.folder'
- Files that are not folders: mimeType != 'application/vnd.google-apps.folder'
- Files modified after a given date (default time zone is UTC)	modifiedTime > '2012-06-04T12:00:00'
- Image or video files modified after a specific date: modifiedTime > '2012-06-04T12:00:00' and (mimeType contains 'image/' or mimeType contains 'video/')
- Files that are starred: starred = true
- Files within a collection (for example, the folder ID in the parents collection): '1234567' in parents
- Files in an application data folder in a collection: 'appDataFolder' in parents
- Files for which user "test@example.org" is the owner: 'test@example.org' in owners
- Files for which user "test@example.org" has write permission: 'test@example.org' in writers
- Files for which members of the group "group@example.org" have write permission: 'group@example.org' in writers
- Files shared with the authorized user with "hello" in the name: sharedWithMe and name contains 'hello'
- Files with a custom file property visible to all apps: properties has { key='mass' and value='1.3kg' }
- Files with a custom file property private to the requesting app: appProperties has { key='additionalID' and value='8e8aceg2af2ge72e78' }
- Files that have not been shared with anyone or domains (only private, or shared with specific users or groups): visibility = 'limited'
`),
      driveId: z
        .string()
        .optional()
        .describe(
          "ID of a specific shared drive to search in. If set, only searches that drive."
        ),
      includeSharedDrives: z
        .boolean()
        .default(true)
        .describe(
          "Whether both My Drive and shared drive items should be included in results. Defaults to true."
        ),
      orderBy: z
        .string()
        .optional()
        .describe(`\
A comma-separated list of sort key. Valid keys are:
\`createdTime\`: When the file was created.
\`folder\`: The folder ID. This field is sorted using alphabetical ordering.
\`modifiedByMeTime\`: The last time the file was modified by the user.
\`modifiedTime\`: The last time the file was modified by anyone.
\`name\`: The name of the file. This field is sorted using alphabetical ordering, so 1, 12, 2, 22.
\`name_natural\`: The name of the file. This field is sorted using natural sort ordering, so 1, 2, 12, 22.
\`quotaBytesUsed\`: The number of storage quota bytes used by the file.
\`recency\`: The most recent timestamp from the file's date-time fields.
\`sharedWithMeTime\`: When the file was shared with the user, if applicable.
\`starred\`: Whether the user has starred the file.
\`viewedByMeTime\`: The last time the file was viewed by the user.
Each key sorts ascending by default, but can be reversed with desc modified. Example: \`folder,modifiedTime desc,name\``),
      pageSize: z
        .number()
        .optional()
        .describe("Maximum number of files to return (max 1000)."),
      pageToken: z.string().optional().describe("Page token for pagination."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Google Drive files",
      done: "Search Google Drive files",
    },
  },
  get_file_content: {
    description: `Get the content of a Google Drive file (Docs, Slides, Sheets, text, PDF, PowerPoint, Word) as text with offset-based pagination. Supported mimeTypes: ${SUPPORTED_MIMETYPES.join(", ")}.`,
    schema: {
      fileId: z
        .string()
        .describe("The ID of the file to retrieve content from."),
      offset: z
        .number()
        .default(0)
        .describe(
          "Character offset to start reading from (for pagination). Defaults to 0."
        ),
      limit: z
        .number()
        .default(MAX_CONTENT_SIZE)
        .describe(
          `Maximum number of characters to return. Defaults to ${MAX_CONTENT_SIZE}.`
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Google Drive file content",
      done: "Get Google Drive file content",
    },
  },
  get_document_structure: {
    description:
      "Get the full structure of a Google Docs document including text, headers, footers, tables, and element indices. Supports pagination for large documents.",
    schema: {
      documentId: z
        .string()
        .describe("The ID of the Google Docs document to retrieve."),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe(
          "Element index to start from (for pagination). Defaults to 0."
        ),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe(
          "Maximum number of elements to return. Defaults to 100. Set to 0 for no limit."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Google Docs structure",
      done: "Get Google Docs structure",
    },
  },
  get_presentation_structure: {
    description:
      "Get the full structure of a Google Slides presentation including slides, shapes, tables, text content, and object IDs. Supports pagination for large presentations.",
    schema: {
      presentationId: z
        .string()
        .describe("The ID of the Google Slides presentation to retrieve."),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe("Slide index to start from (for pagination). Defaults to 0."),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe(
          "Maximum number of slides to return. Defaults to 10. Set to 0 for no limit."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Google Slides structure",
      done: "Get Google Slides structure",
    },
  },
  get_spreadsheet: {
    description:
      "Get metadata and properties of a specific Google Sheets spreadsheet, including sheet names, IDs, row/column counts, and structure. " +
      "Does not return cell values.",
    schema: {
      spreadsheetId: z
        .string()
        .describe("The ID of the spreadsheet to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Google spreadsheet",
      done: "Retrieve Google spreadsheet",
    },
  },
  get_worksheet: {
    description:
      "Get cell values from a specific range in a Google Sheets spreadsheet. Returns values in the specified format (formatted, unformatted, or formulas).",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      range: z
        .string()
        .describe(
          "The A1 notation of the range to retrieve (e.g., 'Sheet1!A1:D10' or 'A1:D10')."
        ),
      majorDimension: z
        .enum(["ROWS", "COLUMNS"])
        .default("ROWS")
        .describe("The major dimension of the values."),
      valueRenderOption: z
        .enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"])
        .default("FORMATTED_VALUE")
        .describe("How values should be represented in the output."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Google worksheet",
      done: "Retrieve Google worksheet",
    },
  },
  list_file_permissions: {
    description:
      "List all permissions (sharing settings) on a Google Drive file, showing who has access and their roles. Requires sharing access to the file.",
    schema: {
      fileId: z.string().describe("The ID of the Google Drive file."),
      capabilities: capabilitiesSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing file permissions",
      done: "List file permissions",
    },
  },
  list_comments: {
    description:
      "List comments on a Google Drive file (Doc, Sheet, or Presentation). Returns comment threads with their replies.",
    schema: {
      fileId: z.string().describe("The ID of the file to list comments from."),
      pageSize: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of comments to return (max 100)."),
      pageToken: z.string().optional().describe("Page token for pagination."),
      includeDeleted: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include deleted comments."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing comments on Google Drive",
      done: "List comments on Google Drive",
    },
  },
});

export const GOOGLE_DRIVE_WRITE_TOOLS_METADATA = createToolsRecord({
  create_document: {
    description:
      "Create a new Google Docs document. Optionally specify a folder to create it in.",
    schema: {
      title: z.string().describe("The title of the new document."),
      parentId: z
        .string()
        .optional()
        .describe(
          "The ID of the folder to create the file in. If not provided, creates in the user's root Drive. Use the search_files tool with `mimeType = 'application/vnd.google-apps.folder'` to find folder IDs."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Google document",
      done: "Create Google document",
    },
  },
  create_spreadsheet: {
    description:
      "Create a new Google Sheets spreadsheet. Optionally specify a folder to create it in.",
    schema: {
      title: z.string().describe("The title of the new spreadsheet."),
      parentId: z
        .string()
        .optional()
        .describe(
          "The ID of the folder to create the file in. If not provided, creates in the user's root Drive. Use the search_files tool with `mimeType = 'application/vnd.google-apps.folder'` to find folder IDs."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Google spreadsheet",
      done: "Create Google spreadsheet",
    },
  },
  create_presentation: {
    description:
      "Create a new Google Slides presentation. Optionally specify a folder to create it in.",
    schema: {
      title: z.string().describe("The title of the new presentation."),
      parentId: z
        .string()
        .optional()
        .describe(
          "The ID of the folder to create the file in. If not provided, creates in the user's root Drive. Use the search_files tool with `mimeType = 'application/vnd.google-apps.folder'` to find folder IDs."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Google presentation",
      done: "Create Google presentation",
    },
  },
  copy_file: {
    description:
      "Copy an existing Google Drive file (Doc, Sheet, or Presentation). " +
      "Creates a duplicate of the file with a new name in the same folder or a different location. " +
      "Prefer this over creating a new document when you want to preserve the formatting or structure of an existing template.",
    schema: {
      fileId: z.string().describe("The ID of the file to copy."),
      name: z
        .string()
        .optional()
        .describe(
          "The name for the copied file. If not provided, defaults to 'Copy of [original name]'."
        ),
      parentId: z
        .string()
        .optional()
        .describe(
          "The ID of the folder to place the copy in. If not provided, the copy will be placed in the same folder as the original."
        ),
      capabilities: capabilitiesSchema,
    },
    stake: "low",
    displayLabels: {
      running: "Copying Google Drive file",
      done: "Copy Google Drive file",
    },
  },
  create_comment: {
    description:
      "Add a comment to a Google Drive file (Doc, Sheet, or Presentation).",
    schema: {
      fileId: z.string().describe("The ID of the file to comment on."),
      content: z.string().describe("The text content of the comment."),
      capabilities: capabilitiesSchema,
    },
    stake: "low",
    displayLabels: {
      running: "Adding comment on Google Drive",
      done: "Add comment on Google Drive",
    },
  },
  create_reply: {
    description:
      "Reply to an existing comment on a Google Drive file (Doc, Sheet, or Presentation).",
    schema: {
      fileId: z.string().describe("The ID of the file containing the comment."),
      commentId: z.string().describe("The ID of the comment to reply to."),
      content: z.string().describe("The plain text content of the reply."),
      capabilities: capabilitiesSchema,
    },
    stake: "low",
    displayLabels: {
      running: "Replying to comment on Google Drive",
      done: "Reply to comment on Google Drive",
    },
  },
  update_document: {
    description:
      "Update a Google Docs document by applying one or more operations (text find/replace, position-based insert/delete/format, table cell and row/column edits, header/footer edits). The server fetches the current document state and resolves text anchors and table coordinates automatically, so you do not need to call get_document_structure first. Use a `raw` operation as an escape hatch for any Google Docs batchUpdate request the named ops don't cover. When replacing content in cells that already have bullet or numbered list formatting, the server automatically strips redundant markers and drops blank lines to prevent double-formatting and empty list items.",
    schema: {
      documentId: z.string().describe("The ID of the document to update."),
      capabilities: capabilitiesSchema,
      operations: DocumentOperationsArraySchema.describe(
        "An array of operations to apply to the document. Operations are resolved server-side from the current document state."
      ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Google document",
      done: "Update Google document",
    },
  },
  append_to_spreadsheet: {
    description:
      "Append rows of data to a Google Sheets spreadsheet. " +
      "This is a simple operation for adding new rows to the end of existing data. " +
      "For more complex operations like formatting, merging cells, or updating existing data, use update_spreadsheet instead.",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      capabilities: capabilitiesSchema,
      range: z
        .string()
        .describe(
          "The A1 notation of the range to append to (e.g., 'Sheet1!A1:D1' or 'Sheet1')."
        ),
      values: z
        .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
        .describe("The values to append. Each sub-array represents a row."),
      majorDimension: z
        .enum(["ROWS", "COLUMNS"])
        .default("ROWS")
        .describe("The major dimension of the values."),
      valueInputOption: z
        .enum(["RAW", "USER_ENTERED"])
        .default("USER_ENTERED")
        .describe("How the input data should be interpreted."),
      insertDataOption: z
        .enum(["OVERWRITE", "INSERT_ROWS"])
        .default("INSERT_ROWS")
        .describe("How the input data should be inserted."),
    },
    stake: "medium",
    displayLabels: {
      running: "Appending to Google spreadsheet",
      done: "Append to Google spreadsheet",
    },
  },
  update_spreadsheet: {
    description:
      "Update a Google Sheets spreadsheet by applying one or more operations (write cells, format ranges, find/replace, merge, sort, insert/delete rows and columns, add/delete sheets). Operations address cells by sheet name + A1 range and the server resolves sheet names to sheetIds automatically, so you do not need to call get_spreadsheet first. Use a `raw` operation as an escape hatch for any Google Sheets batchUpdate request the named ops don't cover (e.g. data validation, conditional formatting, charts). For appending rows to the end of existing data, use append_to_spreadsheet instead — it's simpler and skips sheet-name resolution.",
    schema: {
      spreadsheetId: z
        .string()
        .describe("The ID of the spreadsheet to update."),
      capabilities: capabilitiesSchema,
      operations: SpreadsheetOperationsArraySchema.describe(
        "An array of operations to apply to the spreadsheet. Operations are resolved server-side from the current spreadsheet state."
      ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Google spreadsheet",
      done: "Update Google spreadsheet",
    },
  },
  update_presentation: {
    description:
      "Update a Google Slides presentation by applying one or more operations (find/replace, shape text replacement and insertion, table cell edits, speaker notes, add/delete slides and elements). Operations address slides by 1-indexed number and shapes by text content, index, or placeholder/shape type; the server resolves these to objectIds automatically, so you do not need to call get_presentation_structure first. Use a `raw` operation as an escape hatch for any Google Slides batchUpdate request the named ops don't cover. For populating templates, replaceAllText with `{{placeholder}}` patterns is the simplest approach.",
    schema: {
      presentationId: z
        .string()
        .describe("The ID of the presentation to update."),
      capabilities: capabilitiesSchema,
      operations: PresentationOperationsArraySchema.describe(
        "An array of operations to apply to the presentation. Operations are resolved server-side from the current presentation state."
      ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Google presentation",
      done: "Update Google presentation",
    },
  },
  share_file: {
    description:
      "Share a Google Drive file with a specific person by email, or with everyone in a Google Workspace domain.",
    schema: {
      fileId: z.string().describe("The ID of the Google Drive file to share."),
      type: z
        .enum(["user", "group", "domain"])
        .describe(
          "'user' to share with a specific person, 'group' to share with a Google Group, 'domain' to share with an entire Google Workspace domain."
        ),
      role: z
        .enum(["writer", "commenter", "reader"])
        .describe("The access level to grant."),
      emailAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the person or Google Group to share with. Required when type is 'user' or 'group'."
        ),
      domain: z
        .string()
        .optional()
        .describe(
          'The Google Workspace domain to share with (e.g. "dust.tt"). Required when type is "domain".'
        ),
      allowFileDiscovery: z
        .boolean()
        .optional()
        .describe(
          "Only applies when type is 'domain'. If true, the file appears in search results for domain members. If false (default), the file is only accessible via direct link."
        ),
      sendNotificationEmail: z
        .boolean()
        .optional()
        .describe(
          "Whether to send a notification email. Only applies when type is 'user' or 'group'. Defaults to true."
        ),
      emailMessage: z
        .string()
        .optional()
        .describe("A custom message to include in the notification email."),
      capabilities: capabilitiesSchema,
    },
    stake: "medium",
    displayLabels: {
      running: "Sharing Google Drive file",
      done: "Share Google Drive file",
    },
  },
  update_file_permission: {
    description:
      "Update the role of an existing permission on a Google Drive file. Use list_file_permissions to find the permissionId first. To grant new access, use share_file instead.",
    schema: {
      fileId: z.string().describe("The ID of the Google Drive file."),
      permissionId: z
        .string()
        .describe(
          "The ID of the permission to update. Use list_file_permissions to find this."
        ),
      role: z
        .enum(["writer", "commenter", "reader"])
        .describe("The new access level to set."),
      capabilities: capabilitiesSchema,
    },
    stake: "medium",
    displayLabels: {
      running: "Updating file permission",
      done: "Update file permission",
    },
  },
  revoke_file_sharing: {
    description:
      "Remove access to a Google Drive file for a specific user or domain by deleting the matching permission. Use list_file_permissions to find the permissionId first.",
    schema: {
      fileId: z
        .string()
        .describe("The ID of the Google Drive file to remove access from."),
      permissionId: z
        .string()
        .describe(
          "The ID of the permission to remove. Use list_file_permissions to find this."
        ),
      capabilities: capabilitiesSchema,
    },
    stake: "medium",
    displayLabels: {
      running: "Removing file access",
      done: "Remove file access",
    },
  },
  upload_file: {
    description:
      "Upload a file from the Dust conversation to Google Drive. Optionally specify a folder to upload into.",
    schema: {
      fileId: z
        .string()
        .describe(
          "The Dust fileId from the conversation attachments to upload."
        ),
      parentId: z
        .string()
        .optional()
        .describe(
          "The ID of the folder to upload the file into. If not provided, uploads to the user's root Drive. Use the search_files tool with `mimeType = 'application/vnd.google-apps.folder'` to find folder IDs."
        ),
      fileName: z
        .string()
        .optional()
        .describe(
          "Optional custom filename for the uploaded file. If not provided, uses the original filename from the conversation attachment."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Uploading file to Google Drive",
      done: "Upload file to Google Drive",
    },
  },
});

const ALL_TOOLS_METADATA = {
  ...GOOGLE_DRIVE_TOOLS_METADATA,
  ...GOOGLE_DRIVE_WRITE_TOOLS_METADATA,
};

/**
 * Returns the Google Drive server metadata with all tools including write capabilities.
 */
export function getGoogleDriveServerMetadata() {
  return {
    serverInfo: {
      name: "google_drive",
      version: "1.0.0",
      description:
        "Search, read, create, clone, edit, comment on, and manage permissions for files in Google Drive (Docs, Sheets, Presentations).",
      authorization: {
        provider: "google_drive",
        supported_use_cases: ["personal_actions", "platform_actions"],
        scope:
          "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
      },
      icon: "DriveLogo",
      documentationUrl: "https://docs.dust.tt/docs/google-drive",
      instructions: null,
    },
    tools: Object.values(ALL_TOOLS_METADATA).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
      displayLabels: t.displayLabels,
    })),
    tools_stakes: Object.fromEntries(
      Object.values(ALL_TOOLS_METADATA).map((t) => [t.name, t.stake])
    ),
  } as const satisfies ServerMetadata;
}

// Export the static metadata with all tools
export const GOOGLE_DRIVE_SERVER = getGoogleDriveServerMetadata();
