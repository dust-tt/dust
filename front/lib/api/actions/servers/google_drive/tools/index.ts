import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  makeFileAuthorizationError,
  makePersonalAuthenticationError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { formatDocumentStructure } from "@app/lib/api/actions/servers/google_drive/format_document";
import {
  getDocsClient,
  getDriveClient,
  getSheetsClient,
  getSlidesClient,
} from "@app/lib/api/actions/servers/google_drive/helpers";
import {
  GOOGLE_DRIVE_TOOLS_METADATA,
  GOOGLE_DRIVE_WRITE_TOOLS_METADATA,
  MAX_CONTENT_SIZE,
  MAX_FILE_SIZE,
  SUPPORTED_MIMETYPES,
} from "@app/lib/api/actions/servers/google_drive/metadata";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Checks if an error indicates the file is not authorized.
 * Google returns 404 when user doesn't have access to a file via drive.file scope,
 * or a permission error when the user hasn't granted write access.
 */
export function isFileNotAuthorizedError(err: unknown): boolean {
  const error = normalizeError(err);
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("has not granted") ||
    message.includes("write access")
  );
}

/**
 * Handles file access errors by triggering the authorization flow for unauthorized files.
 * Returns file auth error for 404s and permission errors, generic MCPError otherwise.
 */
export function handleFileAccessError(
  err: unknown,
  fileId: string,
  extra: ToolHandlerExtra,
  fileMeta?: { name?: string; mimeType?: string }
): ToolHandlerResult {
  if (isFileNotAuthorizedError(err)) {
    const connectionId =
      extra.agentLoopContext?.runContext?.toolConfiguration.toolServerId ??
      "google_drive";

    return new Ok(
      makeFileAuthorizationError({
        fileId,
        fileName: fileMeta?.name ?? fileId,
        connectionId,
        mimeType: fileMeta?.mimeType ?? "unknown",
      }).content
    );
  }

  return new Err(
    new MCPError(normalizeError(err).message || "Failed to access file")
  );
}

/**
 * Handles permission errors from Google Drive API calls for write operations.
 * Returns OAuth re-auth prompt for 403/permission errors.
 */
function handlePermissionError(err: unknown): ToolHandlerResult {
  const error = normalizeError(err);

  if (
    error.message?.includes("403") ||
    error.message?.toLowerCase().includes("permission")
  ) {
    // Request both scopes - write tools only exist when FF is enabled
    return new Ok(
      makePersonalAuthenticationError(
        "google_drive",
        "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly"
      ).content
    );
  }

  return new Err(new MCPError(error.message || "Operation failed"));
}

const handlers: ToolHandlers<typeof GOOGLE_DRIVE_TOOLS_METADATA> = {
  list_drives: async ({ pageToken }, { authInfo }) => {
    const drive = await getDriveClient(authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
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
  },

  search_files: async (
    { q, pageToken, pageSize, driveId, includeSharedDrives, orderBy },
    { authInfo }
  ) => {
    const drive = await getDriveClient(authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
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
  },

  get_file_content: async (
    { fileId, offset = 0, limit = MAX_CONTENT_SIZE },
    extra
  ) => {
    const drive = await getDriveClient(extra.authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
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
      return handleFileAccessError(err, fileId, extra);
    }
  },

  get_spreadsheet: async ({ spreadsheetId }, extra) => {
    const sheets = await getSheetsClient(extra.authInfo);
    if (!sheets) {
      return new Err(new MCPError("Failed to authenticate with Google Sheets"));
    }

    try {
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      return new Ok([
        { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
      ]);
    } catch (err) {
      return handleFileAccessError(err, spreadsheetId, extra);
    }
  },

  get_worksheet: async (
    {
      spreadsheetId,
      range,
      majorDimension = "ROWS",
      valueRenderOption = "FORMATTED_VALUE",
    },
    extra
  ) => {
    const sheets = await getSheetsClient(extra.authInfo);
    if (!sheets) {
      return new Err(new MCPError("Failed to authenticate with Google Sheets"));
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
      return handleFileAccessError(err, spreadsheetId, extra);
    }
  },
  list_comments: async (
    { fileId, pageSize = 100, pageToken, includeDeleted = false },
    extra
  ) => {
    const drive = await getDriveClient(extra.authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
    }

    try {
      const res = await drive.comments.list({
        fileId,
        pageSize: Math.min(pageSize, 100),
        pageToken,
        includeDeleted,
        fields:
          "comments(id,content,author,createdTime,modifiedTime,deleted,resolved,replies),nextPageToken",
      });

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(res.data, null, 2),
        },
      ]);
    } catch (err) {
      return handleFileAccessError(err, fileId, extra);
    }
  },
  get_document_structure: async (
    { documentId, offset = 0, limit = 100 },
    extra
  ) => {
    const docs = await getDocsClient(extra.authInfo);
    if (!docs) {
      return new Err(new MCPError("Failed to authenticate with Google Docs"));
    }

    try {
      const res = await docs.documents.get({
        documentId,
      });

      // Format as markdown for better readability
      const markdown = formatDocumentStructure(res.data, offset, limit);

      return new Ok([{ type: "text" as const, text: markdown }]);
    } catch (err) {
      return handleFileAccessError(err, documentId, extra, {
        name: documentId,
        mimeType: "application/vnd.google-apps.document",
      });
    }
  },
};

export const TOOLS = buildTools(GOOGLE_DRIVE_TOOLS_METADATA, handlers);

const writeHandlers: ToolHandlers<typeof GOOGLE_DRIVE_WRITE_TOOLS_METADATA> = {
  create_document: async ({ title }, { authInfo }) => {
    const docs = await getDocsClient(authInfo);
    if (!docs) {
      return new Err(new MCPError("Failed to authenticate with Google Docs"));
    }
    try {
      const res = await docs.documents.create({ requestBody: { title } });
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              documentId: res.data.documentId,
              title: res.data.title,
              url: `https://docs.google.com/document/d/${res.data.documentId}/edit`,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return handlePermissionError(err);
    }
  },

  create_spreadsheet: async ({ title }, { authInfo }) => {
    const sheets = await getSheetsClient(authInfo);
    if (!sheets) {
      return new Err(new MCPError("Failed to authenticate with Google Sheets"));
    }
    try {
      const res = await sheets.spreadsheets.create({
        requestBody: { properties: { title } },
      });
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              spreadsheetId: res.data.spreadsheetId,
              title: res.data.properties?.title,
              url: res.data.spreadsheetUrl,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return handlePermissionError(err);
    }
  },

  create_presentation: async ({ title }, { authInfo }) => {
    const slides = await getSlidesClient(authInfo);
    if (!slides) {
      return new Err(new MCPError("Failed to authenticate with Google Slides"));
    }
    try {
      const res = await slides.presentations.create({ requestBody: { title } });
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              presentationId: res.data.presentationId,
              title: res.data.title,
              url: `https://docs.google.com/presentation/d/${res.data.presentationId}/edit`,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return handlePermissionError(err);
    }
  },

  create_comment: async ({ fileId, content }, extra) => {
    const drive = await getDriveClient(extra.authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
    }

    try {
      const res = await drive.comments.create({
        fileId,
        fields: "id,content,createdTime,author",
        requestBody: { content },
      });
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              commentId: res.data.id,
              content: res.data.content,
              createdTime: res.data.createdTime,
              author: res.data.author?.displayName,
              fileId,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      if (isFileNotAuthorizedError(err)) {
        return handleFileAccessError(err, fileId, extra);
      }

      return handlePermissionError(err);
    }
  },

  create_reply: async ({ fileId, commentId, content }, extra) => {
    const drive = await getDriveClient(extra.authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
    }

    try {
      const res = await drive.replies.create({
        fileId,
        commentId,
        requestBody: {
          content,
        },
        fields: "id,content,author,createdTime",
      });

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              replyId: res.data.id,
              content: res.data.content,
              author: res.data.author,
              createdTime: res.data.createdTime,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      if (isFileNotAuthorizedError(err)) {
        return handleFileAccessError(err, fileId, extra);
      }

      return handlePermissionError(err);
    }
  },

  update_document: async ({ documentId, requests }, extra) => {
    const docs = await getDocsClient(extra.authInfo);
    if (!docs) {
      return new Err(new MCPError("Failed to authenticate with Google Docs"));
    }

    try {
      const res = await docs.documents.batchUpdate(
        {
          documentId,
          requestBody: { requests },
        },
        {}
      );

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              documentId: res.data.documentId,
              appliedUpdates: res.data.replies?.length ?? 0,
              url: `https://docs.google.com/document/d/${documentId}/edit`,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      // Handle file authorization errors (404 or permission issues)
      if (isFileNotAuthorizedError(err)) {
        return handleFileAccessError(err, documentId, extra, {
          name: documentId,
          mimeType: "application/vnd.google-apps.document",
        });
      }
      return handlePermissionError(err);
    }
  },

  append_to_spreadsheet: async (
    {
      spreadsheetId,
      range,
      values,
      majorDimension = "ROWS",
      valueInputOption = "USER_ENTERED",
      insertDataOption = "INSERT_ROWS",
    },
    extra
  ) => {
    const sheets = await getSheetsClient(extra.authInfo);
    if (!sheets) {
      return new Err(new MCPError("Failed to authenticate with Google Sheets"));
    }

    try {
      const res = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption,
        insertDataOption,
        requestBody: {
          values,
          majorDimension,
        },
      });

      return new Ok([
        { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
      ]);
    } catch (err) {
      if (isFileNotAuthorizedError(err)) {
        return handleFileAccessError(err, spreadsheetId, extra, {
          name: spreadsheetId,
          mimeType: "application/vnd.google-apps.spreadsheet",
        });
      }
      return handlePermissionError(err);
    }
  },

  update_presentation: async ({ presentationId, requests }, extra) => {
    const slides = await getSlidesClient(extra.authInfo);
    if (!slides) {
      return new Err(new MCPError("Failed to authenticate with Google Slides"));
    }

    try {
      // Attempt to get presentation metadata first to check access
      const metadata = await slides.presentations.get({
        presentationId,
        fields: "presentationId,title",
      });

      const res = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              presentationId,
              title: metadata.data.title,
              updatedSlides: res.data.replies?.length ?? 0,
              url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      if (isFileNotAuthorizedError(err)) {
        return handleFileAccessError(err, presentationId, extra, {
          name: presentationId,
          mimeType: "application/vnd.google-apps.presentation",
        });
      }
      return handlePermissionError(err);
    }
  },
};

export const WRITE_TOOLS = buildTools(
  GOOGLE_DRIVE_WRITE_TOOLS_METADATA,
  writeHandlers
);
