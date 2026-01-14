import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getFileContentSchema,
  getSpreadsheetSchema,
  getWorksheetSchema,
  GOOGLE_DRIVE_TOOL_NAME,
  listDrivesSchema,
  searchFilesSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/google_drive/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import {
  getGoogleDriveClient,
  getGoogleSheetsClient,
  MAX_FILE_SIZE,
  SUPPORTED_MIMETYPES,
} from "@app/lib/providers/google_drive/utils";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("google_drive");

  async function getDriveClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }
    return getGoogleDriveClient(accessToken);
  }

  async function getSheetsClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }
    return getGoogleSheetsClient(accessToken);
  }

  server.tool(
    "list_drives",
    "List all shared drives accessible by the user.",
    listDrivesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_DRIVE_TOOL_NAME,
        agentLoopContext,
      },
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
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
    searchFilesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_DRIVE_TOOL_NAME,
        agentLoopContext,
      },
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
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
    getFileContentSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_DRIVE_TOOL_NAME,
        agentLoopContext,
      },
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

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(
                {
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
                null,
                2
              ),
            },
          ]);
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

  server.tool(
    "get_spreadsheet",
    "Get metadata and properties of a specific Google Sheets spreadsheet.",
    getSpreadsheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_DRIVE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ spreadsheetId }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
          );
        }

        try {
          const res = await sheets.spreadsheets.get({
            spreadsheetId,
          });

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to get spreadsheet"
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_worksheet",
    "Get data from a specific worksheet in a Google Sheets spreadsheet.",
    getWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_DRIVE_TOOL_NAME,
        agentLoopContext,
      },
      async (
        { spreadsheetId, range, majorDimension, valueRenderOption },
        { authInfo }
      ) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
          );
        }

        try {
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
            majorDimension,
            valueRenderOption,
          });

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to get worksheet data"
            )
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
