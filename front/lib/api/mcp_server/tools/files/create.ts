import { CREATE_CONTENT_MAX_BYTES } from "@app/lib/api/actions/servers/files/metadata";
import {
  frameFileCreateRejectedError,
  frameFileEditRejectedError,
} from "@app/lib/api/actions/servers/files/tools/utils";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
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
      "Scoped file path for the new file (e.g. `conversation-<id>/output.json` or `pod-<id>/reports/summary.txt`)."
    ),
  content: z.string().describe("UTF-8 text content to write."),
  content_type: z
    .string()
    .describe(
      "MIME content type (e.g. `text/plain`, `application/json`, `text/csv`, `text/markdown`)."
    ),
};

export function registerFilesCreateTool(server: McpServer) {
  server.registerTool(
    "files_create",
    {
      description:
        "Create or overwrite a UTF-8 text file in a conversation or Pod file system. " +
        `Content is capped at ${CREATE_CONTENT_MAX_BYTES / 1024} KB. Overwrites existing files. ` +
        "Requires an explicit scope with conversation_id or pod_id.",
      inputSchema,
    },
    async ({ scope, path, content, content_type }) => {
      const auth = getAuthenticatorFromMcpContext();

      const pathError = validatePathMatchesScope(path, scope);
      if (pathError) {
        return mcpError(pathError);
      }

      const contentBuffer = Buffer.from(content, "utf8");
      if (contentBuffer.byteLength > CREATE_CONTENT_MAX_BYTES) {
        return mcpError(
          `Content exceeds the ${CREATE_CONTENT_MAX_BYTES / 1024} KB limit.`
        );
      }

      const fsResult = await getDustFileSystemForScope(auth, scope);
      if (fsResult.isErr()) {
        return mcpError(fsResult.error);
      }
      const dustFs = fsResult.value;

      const incomingMimeType = stripMimeParameters(content_type);
      if (isInteractiveContentType(incomingMimeType)) {
        return mcpError(frameFileCreateRejectedError().message);
      }

      const statResult = await dustFs.stat(path);
      const exists = statResult.isOk() && statResult.value !== null;

      if (statResult.isOk() && statResult.value !== null) {
        const existingMimeType = stripMimeParameters(
          statResult.value.contentType
        );
        if (isInteractiveContentType(existingMimeType)) {
          return mcpError(frameFileEditRejectedError().message);
        }
      }

      const writeResult = await dustFs.write(path, contentBuffer, content_type);
      if (writeResult.isErr()) {
        const err = writeResult.error;
        switch (err.code) {
          case "legacy_path":
          case "unauthorized":
            return mcpError(err.message);
          case "invalid_path":
            return mcpError(`Invalid path: \`${path}\`.`);
          default:
            return mcpError(`Failed to write file \`${path}\`: ${err.message}`);
        }
      }

      const sizeKb = Math.ceil(contentBuffer.byteLength / 1024);
      const verb = exists ? "Updated" : "Created";

      return mcpJsonResponse({
        message: `${verb} \`${path}\` (${content_type}, ${sizeKb} KB)`,
        path,
        contentType: content_type,
      });
    }
  );
}
