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
import { formatPresentationStructure } from "@app/lib/api/actions/servers/google_drive/format_presentation";
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
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Common } from "googleapis";

/**
 * Normalizes GaxiosError code to string for comparison.
 * Note: err.code is typed as string but is actually a number at runtime.
 */
function normalizeCode(code: string | number | undefined): string | undefined {
  return code !== undefined ? String(code) : undefined;
}

/**
 * Handles errors for operations that require per-file permissions.
 * Uses GAxios error typing for cleaner error handling.
 * - For file-specific 403/404 permission errors: triggers file picker flow
 * - For general 403 errors: triggers OAuth re-auth flow
 * - For 404 errors: fetches metadata to provide context about the file type
 * - For other errors: returns generic error message
 */
export async function handleFileAccessError(
  err: unknown,
  fileId: string,
  {
    authInfo,
    agentLoopContext,
  }: Pick<ToolHandlerExtra, "authInfo" | "agentLoopContext">,
  fileMeta?: { name?: string; mimeType?: string }
): Promise<ToolHandlerResult> {
  if (err instanceof Common.GaxiosError) {
    const status = normalizeCode(err.code);
    const message = err.message?.toLowerCase() ?? "";

    // Check for file-specific permission issues that should trigger file picker
    if (
      (status === "403" || status === "404") &&
      (message.includes("caller does not have permission") ||
        message.includes("has not granted") ||
        message.includes("write access"))
    ) {
      const connectionId =
        agentLoopContext?.runContext?.toolConfiguration.toolServerId ??
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

    // Handle general 403 errors with OAuth re-auth
    if (status === "403") {
      return new Ok(
        makePersonalAuthenticationError(
          "google_drive",
          "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly"
        ).content
      );
    }

    // Handle 404 errors - try to fetch metadata for better error message
    if (status === "404") {
      const drive = await getDriveClient(authInfo);
      if (drive) {
        try {
          const fileMetadata = await drive.files.get({
            fileId,
            supportsAllDrives: true,
            fields: "id, name, mimeType",
          });

          const actualMimeType = fileMetadata.data.mimeType;
          const fileName = fileMetadata.data.name ?? fileId;
          const fileTypeInfo = `This file has MIME type: ${actualMimeType}.`;

          return new Err(
            new MCPError(
              `${err.message} File "${fileName}" exists but cannot be accessed with this tool. ${fileTypeInfo}`,
              { tracked: false }
            )
          );
        } catch {
          // If we can't fetch metadata, return the original error
        }
      }

      return new Err(
        new MCPError(err.message ?? "Resource not found", { tracked: false })
      );
    }

    // For all other GAxios errors
    return new Err(
      new MCPError(err.message ?? "Failed to access file", { tracked: false })
    );
  }

  // Fallback for non-GAxios errors
  const error = normalizeError(err);
  return new Err(
    new MCPError(error.message ?? "Failed to access file", { tracked: false })
  );
}

/**
 * Handles errors for operations that only require Drive-level OAuth (read and create tools).
 * Uses GAxios error typing for cleaner error handling.
 * Returns OAuth re-auth prompt for 403 errors, or generic error for others.
 */
function handleDriveAccessError(err: unknown): ToolHandlerResult {
  if (err instanceof Common.GaxiosError) {
    const status = normalizeCode(err.code);

    // Handle 403 errors with OAuth re-auth
    if (status === "403") {
      return new Ok(
        makePersonalAuthenticationError(
          "google_drive",
          "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly"
        ).content
      );
    }

    return new Err(
      new MCPError(err.message ?? "Operation failed", { tracked: false })
    );
  }

  // Fallback for non-GAxios errors
  const error = normalizeError(err);
  return new Err(
    new MCPError(error.message ?? "Operation failed", { tracked: false })
  );
}

/**
 * Adds agent attribution to content (comments, replies, etc.).
 * Returns the original content with attribution appended if agent context is available.
 */
function addAgentAttribution(
  content: string,
  { agentLoopContext }: Pick<ToolHandlerExtra, "agentLoopContext">
): string {
  if (agentLoopContext?.runContext?.agentConfiguration) {
    const agentConfig = agentLoopContext.runContext.agentConfiguration;
    return `${content}\n\nSent via ${agentConfig.name} Agent on Dust`;
  }
  return content;
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
        new MCPError(normalizeError(err).message ?? "Failed to list drives")
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
        new MCPError(error.message ?? "Failed to search files", {
          cause: error,
        })
      );
    }
  },

  get_file_content: async (
    { fileId, offset = 0, limit = MAX_CONTENT_SIZE },
    { authInfo }
  ) => {
    const drive = await getDriveClient(authInfo);
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
      return handleDriveAccessError(err);
    }
  },

  get_spreadsheet: async ({ spreadsheetId }, { authInfo }) => {
    const sheets = await getSheetsClient(authInfo);
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
      return handleDriveAccessError(err);
    }
  },

  get_worksheet: async (
    {
      spreadsheetId,
      range,
      majorDimension = "ROWS",
      valueRenderOption = "FORMATTED_VALUE",
    },
    { authInfo }
  ) => {
    const sheets = await getSheetsClient(authInfo);
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
      return handleDriveAccessError(err);
    }
  },
  list_comments: async (
    { fileId, pageSize = 100, pageToken, includeDeleted = false },
    { authInfo }
  ) => {
    const drive = await getDriveClient(authInfo);
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
      return handleDriveAccessError(err);
    }
  },
  get_document_structure: async (
    { documentId, offset = 0, limit = 100 },
    { authInfo }
  ) => {
    const docs = await getDocsClient(authInfo);
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
      return handleDriveAccessError(err);
    }
  },
  get_presentation_structure: async (
    { presentationId, offset = 0, limit = 10 },
    { authInfo }
  ) => {
    const slides = await getSlidesClient(authInfo);
    if (!slides) {
      return new Err(new MCPError("Failed to authenticate with Google Slides"));
    }

    try {
      const res = await slides.presentations.get({
        presentationId,
      });

      // Format as markdown for better readability
      const markdown = formatPresentationStructure(res.data, offset, limit);

      return new Ok([{ type: "text" as const, text: markdown }]);
    } catch (err) {
      return handleDriveAccessError(err);
    }
  },
};

const readOnlyTools = buildTools(GOOGLE_DRIVE_TOOLS_METADATA, handlers);

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
      return handleDriveAccessError(err);
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
      return handleDriveAccessError(err);
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
      return handleDriveAccessError(err);
    }
  },

  copy_file: async ({ fileId, name, parentId }, { authInfo }) => {
    const drive = await getDriveClient(authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
    }

    const requestBody: { name?: string; parents?: string[] } = {};
    if (name) {
      requestBody.name = name;
    }
    if (parentId) {
      requestBody.parents = [parentId];
    }

    let res;
    try {
      res = await drive.files.copy({
        fileId,
        requestBody,
        supportsAllDrives: true,
        fields: "id,name,mimeType,webViewLink",
      });
    } catch (err) {
      return handleDriveAccessError(err);
    }

    // Construct appropriate URL based on file type
    let url = res.data.webViewLink;
    if (res.data.mimeType === "application/vnd.google-apps.document") {
      url = `https://docs.google.com/document/d/${res.data.id}/edit`;
    } else if (
      res.data.mimeType === "application/vnd.google-apps.spreadsheet"
    ) {
      url = `https://docs.google.com/spreadsheets/d/${res.data.id}/edit`;
    } else if (
      res.data.mimeType === "application/vnd.google-apps.presentation"
    ) {
      url = `https://docs.google.com/presentation/d/${res.data.id}/edit`;
    }

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            fileId: res.data.id,
            name: res.data.name,
            mimeType: res.data.mimeType,
            url,
          },
          null,
          2
        ),
      },
    ]);
  },

  create_comment: async (
    { fileId, content },
    { authInfo, agentLoopContext }
  ) => {
    const drive = await getDriveClient(authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
    }

    const finalContent = addAgentAttribution(content, { agentLoopContext });

    try {
      const res = await drive.comments.create({
        fileId,
        fields: "id,content,createdTime,author",
        requestBody: { content: finalContent },
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
      return handleFileAccessError(err, fileId, { authInfo, agentLoopContext });
    }
  },

  create_reply: async (
    { fileId, commentId, content },
    { authInfo, agentLoopContext }
  ) => {
    const drive = await getDriveClient(authInfo);
    if (!drive) {
      return new Err(new MCPError("Failed to authenticate with Google Drive"));
    }

    const finalContent = addAgentAttribution(content, { agentLoopContext });

    try {
      const res = await drive.replies.create({
        fileId,
        commentId,
        requestBody: {
          content: finalContent,
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
      return handleFileAccessError(err, fileId, { authInfo, agentLoopContext });
    }
  },

  update_document: async (
    { documentId, requests },
    { authInfo, agentLoopContext }
  ) => {
    const docs = await getDocsClient(authInfo);
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
      return handleFileAccessError(
        err,
        documentId,
        { authInfo, agentLoopContext },
        {
          name: documentId,
          mimeType: "application/vnd.google-apps.document",
        }
      );
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
    { authInfo, agentLoopContext }
  ) => {
    const sheets = await getSheetsClient(authInfo);
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
      return handleFileAccessError(
        err,
        spreadsheetId,
        { authInfo, agentLoopContext },
        {
          name: spreadsheetId,
          mimeType: "application/vnd.google-apps.spreadsheet",
        }
      );
    }
  },

  update_spreadsheet: async (
    { spreadsheetId, requests },
    { authInfo, agentLoopContext }
  ) => {
    const sheets = await getSheetsClient(authInfo);
    if (!sheets) {
      return new Err(new MCPError("Failed to authenticate with Google Sheets"));
    }

    try {
      const res = await sheets.spreadsheets.batchUpdate(
        {
          spreadsheetId,
          requestBody: { requests: requests as any },
        },
        {}
      );

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              spreadsheetId,
              appliedUpdates: res.data.replies?.length ?? 0,
              url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return handleFileAccessError(
        err,
        spreadsheetId,
        { authInfo, agentLoopContext },
        {
          name: spreadsheetId,
          mimeType: "application/vnd.google-apps.spreadsheet",
        }
      );
    }
  },

  update_presentation: async (
    { presentationId, requests },
    { authInfo, agentLoopContext }
  ) => {
    const slides = await getSlidesClient(authInfo);
    if (!slides) {
      return new Err(new MCPError("Failed to authenticate with Google Slides"));
    }

    try {
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
              appliedUpdates: res.data.replies?.length ?? 0,
              url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return handleFileAccessError(
        err,
        presentationId,
        { authInfo, agentLoopContext },
        {
          name: presentationId,
          mimeType: "application/vnd.google-apps.presentation",
        }
      );
    }
  },
};

const writeTools = buildTools(GOOGLE_DRIVE_WRITE_TOOLS_METADATA, writeHandlers);

export const TOOLS = [...readOnlyTools, ...writeTools];
