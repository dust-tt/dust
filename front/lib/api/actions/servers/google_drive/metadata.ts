import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

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
    description: `Get the content of a Google Drive file with offset-based pagination. Supported mimeTypes: ${SUPPORTED_MIMETYPES.join(", ")}.`,
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
  get_spreadsheet: {
    description:
      "Get metadata and properties of a specific Google Sheets spreadsheet.",
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
      "Get data from a specific worksheet in a Google Sheets spreadsheet.",
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
      "Update an existing Google Docs document by appending or replacing content.",
    schema: {
      documentId: z.string().describe("The ID of the document to update."),
      content: z.string().describe("The text content to insert."),
      mode: z
        .enum(["append", "replace"])
        .default("append")
        .describe(
          "How to update the document: 'append' adds content at the end, 'replace' replaces all existing content."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Google document",
      done: "Update Google document",
    },
  },
  append_to_spreadsheet: {
    description: "Append rows of data to a Google Sheets spreadsheet.",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      range: z
        .string()
        .describe(
          "The A1 notation of the range to append to (e.g., 'Sheet1!A1:D1')."
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
  update_presentation: {
    description:
      "Update an existing Google Slides presentation by adding, modifying, or deleting slides and content.",
    schema: {
      presentationId: z
        .string()
        .describe("The ID of the presentation to update."),
      requests: z
        .array(z.record(z.string(), z.unknown()))
        .describe(
          "An array of batch update requests to apply to the presentation. " +
            "Each request is an object with a single key indicating the request type. " +
            "See https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate for request types. " +
            "Common requests include createSlide, deleteObject, insertText, updateTextStyle, etc."
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
