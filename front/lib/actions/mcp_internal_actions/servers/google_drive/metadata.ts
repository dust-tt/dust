import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// =============================================================================
// Constants - Exported for use by server and utils
// =============================================================================

// Defined here to avoid circular dependencies and allow client-side imports
export const SUPPORTED_MIMETYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "text/plain",
  "text/markdown",
  "text/csv",
];

export const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const GOOGLE_DRIVE_TOOL_NAME = "google_drive" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const listDrivesSchema = {
  pageToken: z.string().optional().describe("Page token for pagination."),
};

export const searchFilesSchema = {
  q: z.string().optional().describe(`\
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
  orderBy: z.string().optional().describe(`\
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
};

export const getFileContentSchema = {
  fileId: z.string().describe("The ID of the file to retrieve content from."),
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
};

export const getSpreadsheetSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet to retrieve."),
  includeGridData: z
    .boolean()
    .default(false)
    .describe("Whether to include grid data in the response."),
};

export const getWorksheetSchema = {
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
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const GOOGLE_DRIVE_TOOLS: MCPToolType[] = [
  {
    name: "list_drives",
    description: "List all shared drives accessible by the user.",
    inputSchema: zodToJsonSchema(z.object(listDrivesSchema)) as JSONSchema,
  },
  {
    name: "search_files",
    description:
      "Search for files in Google Drive. Can search in personal drive, all shared drives, or a specific drive.",
    inputSchema: zodToJsonSchema(z.object(searchFilesSchema)) as JSONSchema,
  },
  {
    name: "get_file_content",
    description:
      `Get the content of a Google Drive file with offset-based pagination. ` +
      `Supported mimeTypes: ${SUPPORTED_MIMETYPES.join(", ")}.`,
    inputSchema: zodToJsonSchema(z.object(getFileContentSchema)) as JSONSchema,
  },
  {
    name: "get_spreadsheet",
    description:
      "Get metadata and properties of a specific Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(getSpreadsheetSchema)) as JSONSchema,
  },
  {
    name: "get_worksheet",
    description:
      "Get data from a specific worksheet in a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(getWorksheetSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const GOOGLE_DRIVE_SERVER_INFO = {
  name: "google_drive" as const,
  version: "1.0.0",
  description: "Search and read files (Docs, Sheets, Presentations).",
  authorization: {
    provider: "google_drive" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope: "https://www.googleapis.com/auth/drive.readonly" as const,
  },
  icon: "DriveLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/google-drive",
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const GOOGLE_DRIVE_TOOL_STAKES = {
  list_drives: "never_ask",
  search_files: "never_ask",
  get_file_content: "never_ask",
  get_spreadsheet: "never_ask",
  get_worksheet: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
