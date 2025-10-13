import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const SUPPORTED_MIMETYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
];

const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content
const MAX_FILE_SIZE = 64 * 1024 * 1024; // 10 MB max original file size

const createServer = (auth: any): McpServer => {
  const server = makeInternalMCPServer("google_drive");

  async function getDriveClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.drive({
      version: "v3",
      auth: oauth2Client,
    });
  }

  server.tool(
    "list_drives",
    "List all shared drives accessible by the user.",
    {
      pageToken: z.string().optional().describe("Page token for pagination."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "google_drive" },
      async ({ pageToken }, { authInfo }) => {
        const drive = await getDriveClient(authInfo);
        if (!drive) {
          return new Err(
            new MCPError("Failed to authenticate with Google Drive")
          );
        }

        try {
          const res = await drive.drives.list({
            pageToken,
            pageSize: 100,
            fields: "nextPageToken, drives(id, name, createdTime)",
          });

          return new Ok(
            makeMCPToolJSONSuccess({
              result: res.data,
            }).content
          );
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to list drives")
          );
        }
      }
    )
  );

  server.tool(
    "search_files",
    "Search for files in Google Drive. Can search in personal drive, all shared drives, or a specific drive.",
    {
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
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "google_drive" },
      async (
        { q, pageToken, pageSize, driveId, includeSharedDrives, orderBy },
        { authInfo }
      ) => {
        const drive = await getDriveClient(authInfo);
        if (!drive) {
          return new Err(
            new MCPError("Failed to authenticate with Google Drive")
          );
        }

        try {
          const requestParams: {
            q?: string;
            pageToken?: string;
            pageSize?: number;
            fields: string;
            orderBy?: string;
            driveId?: string;
            includeItemsFromAllDrives?: boolean;
            supportsAllDrives?: boolean;
            corpora?: string;
          } = {
            q,
            pageToken,
            pageSize: pageSize ? Math.min(pageSize, 1000) : undefined,
            fields:
              "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, owners, parents, webViewLink, shared)",
            orderBy,
          };

          if (driveId) {
            // Search in a specific shared drive
            requestParams.driveId = driveId;
            requestParams.includeItemsFromAllDrives = true;
            requestParams.supportsAllDrives = true;
            requestParams.corpora = "drive";
          } else if (includeSharedDrives) {
            // Search across all drives (personal + shared)
            requestParams.includeItemsFromAllDrives = true;
            requestParams.supportsAllDrives = true;
            requestParams.corpora = "allDrives";
          }
          // If neither driveId nor includeSharedDrives, search only personal drive (default behavior)

          const res = await drive.files.list(requestParams);

          return new Ok(
            makeMCPToolJSONSuccess({
              result: res.data,
            }).content
          );
        } catch (err) {
          const error = normalizeError(err);
          return new Err(
            new MCPError(error.message || "Failed to search files", {
              cause: error,
            })
          );
        }
      }
    )
  );

  server.tool(
    "get_file_content",
    `Get the content of a Google Drive file with offset-based pagination. ` +
      `Supported mimeTypes: ${SUPPORTED_MIMETYPES.join(", ")}.`,
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: "google_drive" },
      async ({ fileId, offset, limit }, { authInfo }) => {
        const drive = await getDriveClient(authInfo);
        if (!drive) {
          return new Err(
            new MCPError("Failed to authenticate with Google Drive")
          );
        }

        try {
          // First, get file metadata to determine the mimetype
          const fileMetadata = await drive.files.get({
            fileId,
            supportsAllDrives: true,
            fields: "id, name, mimeType, size",
          });
          const file = fileMetadata.data;

          if (!file.mimeType || !SUPPORTED_MIMETYPES.includes(file.mimeType)) {
            return new Err(
              new MCPError(
                `Unsupported file type: ${file.mimeType}. Supported types: ${SUPPORTED_MIMETYPES.join(", ")}`,
                {
                  tracked: false,
                }
              )
            );
          }
          if (file.size && parseInt(file.size, 10) > MAX_FILE_SIZE) {
            return new Err(
              new MCPError(
                `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
                {
                  tracked: false,
                }
              )
            );
          }

          let content: string;

          switch (file.mimeType) {
            case "application/vnd.google-apps.document":
            case "application/vnd.google-apps.presentation": {
              // Export Google Docs and Presentations as plain text
              const exportRes = await drive.files.export({
                fileId,
                mimeType: "text/plain",
              });
              if (typeof exportRes.data !== "string") {
                return new Err(
                  new MCPError("Failed to export file content as text/plain")
                );
              }
              content = exportRes.data;
              break;
            }
            case "text/plain":
            case "text/markdown":
            case "text/csv": {
              // Download regular text files
              const downloadRes = await drive.files.get({
                fileId,
                alt: "media",
              });

              if (typeof downloadRes.data !== "string") {
                return new Err(
                  new MCPError("Failed to download file content as text")
                );
              }
              content = downloadRes.data;
              break;
            }
            default:
              return new Err(
                new MCPError(`Unsupported file type: ${file.mimeType}`, {
                  tracked: false,
                })
              );
          }

          // Apply offset and limit
          const totalContentLength = content.length;
          const startIndex = Math.max(0, offset);
          const endIndex = Math.min(content.length, startIndex + limit);
          const truncatedContent = content.slice(startIndex, endIndex);

          const hasMore = endIndex < content.length;
          const nextOffset = hasMore ? endIndex : undefined;

          return new Ok(
            makeMCPToolJSONSuccess({
              result: {
                fileId,
                fileName: file.name,
                mimeType: file.mimeType,
                content: truncatedContent,
                returnedContentLength: truncatedContent.length,
                totalContentLength,
                offset: startIndex,
                nextOffset,
                hasMore,
              },
            }).content
          );
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to get file content"
            )
          );
        }
      }
    )
  );

  return server;
};

export default createServer;
