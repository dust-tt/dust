import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const SUPPORTED_MIMETYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "text/plain",
  "text/markdown",
];

const MAX_CONTENT_SIZE = 50000; // Max characters to return for file content

const createServer = (): McpServer => {
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
    "List all Google drives (shared drives) accessible by the user.",
    {
      pageToken: z.string().optional().describe("Page token for pagination."),
      pageSize: z
        .number()
        .optional()
        .describe("Maximum number of drives to return (max 100)."),
    },
    async ({ pageToken, pageSize }, { authInfo }) => {
      const drive = await getDriveClient(authInfo);
      if (!drive) {
        return makeMCPToolTextError("Failed to authenticate with Google Drive");
      }

      try {
        const res = await drive.drives.list({
          pageToken,
          pageSize: pageSize ? Math.min(pageSize, 100) : undefined,
          fields: "nextPageToken, drives(id, name, createdTime)",
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to list drives"
        );
      }
    }
  );

  server.tool(
    "search_files",
    "Search for files in Google Drive. Can search in personal drive, all shared drives, or a specific drive.",
    {
      query: z
        .string()
        .optional()
        .describe(
          "Search query to filter files. Uses Google Drive's search syntax. Leave empty to list all supported files."
        ),
      pageToken: z.string().optional().describe("Page token for pagination."),
      pageSize: z
        .number()
        .optional()
        .describe("Maximum number of files to return (max 1000)."),
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
          "Whether to include files from shared drives. Only valid if driveId is not set."
        ),
      orderBy: z
        .string()
        .optional()
        .describe(
          "How to order the results. Examples: 'modifiedTime desc', 'name', 'createdTime desc'"
        ),
    },
    async (
      { query, pageToken, pageSize, driveId, includeSharedDrives, orderBy },
      { authInfo }
    ) => {
      const drive = await getDriveClient(authInfo);
      if (!drive) {
        return makeMCPToolTextError("Failed to authenticate with Google Drive");
      }

      try {
        // Build query to filter by supported mimetypes
        const mimetypeQuery = SUPPORTED_MIMETYPES.map(
          (mimetype) => `mimeType='${mimetype}'`
        ).join(" or ");

        const searchQuery = query
          ? `(${mimetypeQuery}) and (${query})`
          : `(${mimetypeQuery})`;

        const requestParams: {
          q: string;
          pageToken?: string;
          pageSize?: number;
          fields: string;
          orderBy?: string;
          driveId?: string;
          includeItemsFromAllDrives?: boolean;
          supportsAllDrives?: boolean;
          corpora?: string;
        } = {
          q: searchQuery,
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

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to search files"
        );
      }
    }
  );

  server.tool(
    "get_file_content",
    "Get the content of a Google Drive file. Supports Google Docs, Presentations, Sheets, and text files with offset-based pagination.",
    {
      fileId: z
        .string()
        .describe("The ID of the file to retrieve content from."),
      offset: z
        .number()
        .default(0)
        .describe("Character offset to start reading from (for pagination)."),
      limit: z
        .number()
        .default(MAX_CONTENT_SIZE)
        .describe(
          `Maximum number of characters to return, defaults to ${MAX_CONTENT_SIZE}.`
        ),
    },
    async ({ fileId, offset, limit }, { authInfo }) => {
      const drive = await getDriveClient(authInfo);
      if (!drive) {
        return makeMCPToolTextError("Failed to authenticate with Google Drive");
      }

      try {
        // First, get file metadata to determine the mimetype
        const fileMetadata = await drive.files.get({
          fileId,
          fields: "id, name, mimeType, size",
        });

        const file = fileMetadata.data;
        if (!file.mimeType || !SUPPORTED_MIMETYPES.includes(file.mimeType)) {
          return makeMCPToolTextError(
            `Unsupported file type: ${file.mimeType}. Supported types: ${SUPPORTED_MIMETYPES.join(", ")}`
          );
        }

        let content: string;

        // Handle different file types
        if (
          file.mimeType === "application/vnd.google-apps.document" ||
          file.mimeType === "application/vnd.google-apps.presentation" ||
          file.mimeType === "application/vnd.google-apps.spreadsheet"
        ) {
          // Export Google Docs and Presentations as plain text
          const exportResponse = await drive.files.export({
            fileId,
            mimeType: "text/plain",
          });
          if (typeof exportResponse.data !== "string") {
            return makeMCPToolTextError(
              "Failed to export file content as text/plain"
            );
          }
          content = exportResponse.data;
        } else if (
          file.mimeType === "text/plain" ||
          file.mimeType === "text/markdown"
        ) {
          // Download regular text files
          const downloadResponse = await drive.files.get({
            fileId,
            alt: "media",
          });

          if (typeof downloadResponse.data !== "string") {
            return makeMCPToolTextError(
              "Failed to download file content as text"
            );
          }
          content = downloadResponse.data;
        } else {
          return makeMCPToolTextError(
            `Unsupported file type: ${file.mimeType}`
          );
        }

        // Apply offset and limit
        const totalContentLength = content.length;
        const startIndex = Math.max(0, offset);
        const endIndex = Math.min(content.length, startIndex + limit);
        const truncatedContent = content.slice(startIndex, endIndex);

        const hasMore = endIndex < content.length;
        const nextOffset = hasMore ? endIndex : undefined;

        return makeMCPToolJSONSuccess({
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
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to get file content"
        );
      }
    }
  );

  return server;
};

export default createServer;
