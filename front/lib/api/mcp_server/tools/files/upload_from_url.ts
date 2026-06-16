import { uploadFileFromUrlToFileSystem } from "@app/lib/api/file_system/upload_from_url";
import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import { sanitizeUrlForDisplay } from "@app/types/shared/utils/url_utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";
import { getDustFileSystemForScope, validatePathMatchesScope } from "./context";
import { FILES_SCOPE_SCHEMA } from "./schemas";

const inputSchema = {
  scope: FILES_SCOPE_SCHEMA.describe(
    "File system scope matching the path's conversation or Pod."
  ),
  path: z
    .string()
    .describe(
      "Scoped destination path (e.g. `conversation-<id>/report.pdf` or `pod-<id>/assets/logo.png`). Overwrites if the file already exists."
    ),
  url: z
    .string()
    .url()
    .describe("Public HTTP(S) URL of the file to download and store."),
  content_type: z
    .string()
    .optional()
    .describe(
      "Optional MIME content type override when the remote server does not send a reliable Content-Type header."
    ),
};

export function registerFilesUploadFromUrlTool(server: McpServer) {
  registerDustMcpTool(
    server,
    "files_upload_from_url",
    {
      description:
        "Download a file from a public HTTP(S) URL and store it in a conversation or Pod file system. " +
        "Supports binary files (PDF, images, spreadsheets, etc.) that cannot be created with `files_create`. " +
        "Overwrites existing files at the destination path. " +
        "Requires an explicit scope with conversation_id or pod_id.",
      inputSchema,
    },
    async (auth, { scope, path, url, content_type }) => {
      const pathError = validatePathMatchesScope(path, scope);
      if (pathError) {
        return mcpError(pathError);
      }

      const fsResult = await getDustFileSystemForScope(auth, scope);
      if (fsResult.isErr()) {
        return mcpError(fsResult.error);
      }

      const uploadResult = await uploadFileFromUrlToFileSystem(fsResult.value, {
        path,
        url,
        contentType: content_type,
      });

      if (uploadResult.isErr()) {
        return mcpError(uploadResult.error.message);
      }

      const { contentType, sizeBytes, existed } = uploadResult.value;
      const sizeKb = Math.ceil(sizeBytes / 1024);
      const verb = existed ? "Updated" : "Created";

      return mcpJsonResponse({
        message: `${verb} \`${path}\` from URL (${contentType}, ${sizeKb} KB)`,
        path,
        contentType,
        sizeBytes,
        sourceUrl: sanitizeUrlForDisplay(url),
      });
    }
  );
}
