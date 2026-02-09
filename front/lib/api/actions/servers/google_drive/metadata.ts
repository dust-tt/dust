import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { GoogleDocsRequestsArraySchema } from "@app/lib/api/actions/servers/google_drive/google_docs_request_types";
import { GoogleSheetsRequestsArraySchema } from "@app/lib/api/actions/servers/google_drive/google_sheets_request_types";
import { GoogleSlidesRequestsArraySchema } from "@app/lib/api/actions/servers/google_drive/google_slides_request_types";

export const SUPPORTED_MIMETYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "text/plain",
  "text/markdown",
  "text/csv",
];

export const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content
export const MAX_FILE_SIZE = 64 * 1024 * 1024; // 64 MB max original file size

export const GOOGLE_DRIVE_TOOL_NAME = "google_drive" as const;

// Tool name constants for cross-referencing in descriptions
const GET_DOCUMENT_STRUCTURE_TOOL = "get_document_structure" as const;
const GET_PRESENTATION_STRUCTURE_TOOL = "get_presentation_structure" as const;
const GET_WORKSHEET_TOOL = "get_worksheet" as const;

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
    description: `Get the content of a Google Drive file as plain text with offset-based pagination. Supported mimeTypes: ${SUPPORTED_MIMETYPES.join(", ")}. For structured content with element indices/object IDs needed for updates, use ${GET_DOCUMENT_STRUCTURE_TOOL} (Docs) or ${GET_PRESENTATION_STRUCTURE_TOOL} (Slides) instead.`,
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
  [GET_DOCUMENT_STRUCTURE_TOOL]: {
    description:
      "Get the full structure of a Google Docs document including text, tables, formatting, and indices. " +
      "Use this instead of get_file_content when working with tables or when you need element indices for updates. " +
      "Supports pagination for large documents.",
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
  [GET_PRESENTATION_STRUCTURE_TOOL]: {
    description:
      "Get the full structure of a Google Slides presentation including slides, page elements (shapes, tables, images, videos), text content, and object IDs. " +
      "Use this instead of get_file_content when you need object IDs for updates or want to understand the presentation structure. " +
      "Object IDs are required for most update operations like insertText, deleteObject, updateTextStyle, etc. " +
      "Supports pagination for large presentations.",
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
      "Get cell values from a specific range in a Google Sheets spreadsheet. " +
      "Returns cell values in the specified format (formatted, unformatted, or formulas).",
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
    description: "Create a new Google Docs document in the user's Drive.",
    schema: {
      title: z.string().describe("The title of the new document."),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Google document",
      done: "Create Google document",
    },
  },
  create_spreadsheet: {
    description: "Create a new Google Sheets spreadsheet in the user's Drive.",
    schema: {
      title: z.string().describe("The title of the new spreadsheet."),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Google spreadsheet",
      done: "Create Google spreadsheet",
    },
  },
  create_presentation: {
    description: "Create a new Google Slides presentation in the user's Drive.",
    schema: {
      title: z.string().describe("The title of the new presentation."),
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
      "Creates a duplicate of the file with a new name in the same folder or a different location.",
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
    },
    stake: "low",
    displayLabels: {
      running: "Replying to comment on Google Drive",
      done: "Reply to comment on Google Drive",
    },
  },
  update_document: {
    description:
      "Update an existing Google Docs document by inserting/deleting text, working with tables, and applying formatting. " +
      `Call ${GET_DOCUMENT_STRUCTURE_TOOL} first to get current indices when working with existing tables or specific locations. ` +
      "For multiple operations, order requests from highest to lowest index (write backwards) to avoid recalculating indices after each change. " +
      "Text must be inserted within paragraph bounds, not at structural element boundaries (e.g., insert at startIndex + 1 for table cells).",
    schema: {
      documentId: z.string().describe("The ID of the document to update."),
      requests: GoogleDocsRequestsArraySchema.describe(
        "An array of batch update requests to apply to the document. " +
          "Each request is an object with optional properties for each request type (only one should be set per request). " +
          "See https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate for request types. " +
          "Common requests include insertText, deleteContentRange, insertTable, insertTableRow, updateTableCellStyle, updateTextStyle, etc."
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
      "Update a Google Sheets spreadsheet using batch update operations. " +
      "Supports complex operations like inserting/deleting/moving rows and columns, merging cells, sorting ranges, " +
      "updating cell formatting and borders, setting data validation, adding filters, find and replace, and more. " +
      `For operations that need to know current data or structure (e.g., updating specific cells, working with existing ranges), call ${GET_WORKSHEET_TOOL} first to understand the current layout. ` +
      "Each request is an object with one property set (e.g., {updateCells: {...}} or {mergeCells: {...}}). " +
      "See https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate for available request types.",
    schema: {
      spreadsheetId: z
        .string()
        .describe("The ID of the spreadsheet to update."),
      requests: GoogleSheetsRequestsArraySchema.describe(
        "An array of batch update requests to apply to the spreadsheet. " +
          "Each request is an object with optional properties for each request type (only one should be set per request). " +
          "Common requests include updateCells, insertDimension, deleteDimension, mergeCells, sortRange, updateBorders, etc."
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
      "Update an existing Google Slides presentation by adding, modifying, or deleting slides and content. " +
      `Call ${GET_PRESENTATION_STRUCTURE_TOOL} first to get object IDs when working with existing elements (shapes, tables, images, etc.). ` +
      "Common operations include createSlide, insertText, deleteObject, updateTextStyle, createTable, insertTableRows, etc.",
    schema: {
      presentationId: z
        .string()
        .describe("The ID of the presentation to update."),
      requests: GoogleSlidesRequestsArraySchema.describe(
        "An array of batch update requests to apply to the presentation. " +
          "Each request is an object with optional properties for each request type (only one should be set per request). " +
          "See https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate for request types. " +
          "Common requests include createSlide, deleteObject, insertText, updateTextStyle, createTable, insertTableRows, etc."
      ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Google presentation",
      done: "Update Google presentation",
    },
  },
});

const ALL_TOOLS_METADATA = {
  ...GOOGLE_DRIVE_TOOLS_METADATA,
  ...GOOGLE_DRIVE_WRITE_TOOLS_METADATA,
};

/**
 * Returns the Google Drive server metadata, optionally filtering out write tools
 * based on the feature flag.
 */
export function getGoogleDriveServerMetadata(
  includeWriteTools: boolean
): ServerMetadata {
  const toolsMetadata = includeWriteTools
    ? ALL_TOOLS_METADATA
    : GOOGLE_DRIVE_TOOLS_METADATA;

  return {
    serverInfo: {
      name: "google_drive",
      version: "1.0.0",
      // TODO(google_drive_write): Update description to mention write capabilities
      // when google_drive_write_enabled feature flag is removed and write is GA:
      // "Search, read, and create files in Google Drive (Docs, Sheets, Presentations)."
      description: "Search and read files (Docs, Sheets, Presentations).",
      authorization: {
        provider: "google_drive",
        supported_use_cases: ["personal_actions"],
        scope: "https://www.googleapis.com/auth/drive.readonly",
      },
      icon: "DriveLogo",
      documentationUrl: "https://docs.dust.tt/docs/google-drive",
      instructions: null,
    },
    tools: Object.values(toolsMetadata).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
      displayLabels: t.displayLabels,
    })),
    tools_stakes: Object.fromEntries(
      Object.values(toolsMetadata).map((t) => [t.name, t.stake])
    ),
  } as const satisfies ServerMetadata;
}

// Export the static metadata with all tools for backward compatibility
// This is used in constants.ts and will be updated to use the dynamic function
export const GOOGLE_DRIVE_SERVER = getGoogleDriveServerMetadata(true);
