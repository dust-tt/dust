import {
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { FileResource } from "@app/lib/resources/file_resource";
import type { LightWorkspaceType } from "@app/types/user";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";
import { getDustFileSystemForScope } from "./context";
import type { FilesScope } from "./schemas";
import { FILES_SCOPE_SCHEMA } from "./schemas";

function gcsPathToCanonical(
  workspace: LightWorkspaceType,
  mountFilePath: string
): string | null {
  const base = `w/${workspace.sId}/`;
  if (!mountFilePath.startsWith(base)) {
    return null;
  }

  const rest = mountFilePath.slice(base.length);

  const conv = rest.match(/^conversations\/([^/]+)\/files\/(.+)$/);
  if (conv) {
    return `${SCOPED_PREFIX_CONVERSATION}${conv[1]}/${conv[2]}`;
  }

  const pod =
    rest.match(/^pods\/([^/]+)\/files\/(.+)$/) ??
    rest.match(/^projects\/([^/]+)\/files\/(.+)$/);
  if (pod) {
    return `${SCOPED_PREFIX_POD}${pod[1]}/${pod[2]}`;
  }

  return null;
}

function scopeMatchesCanonicalPath(
  scope: FilesScope,
  canonicalPath: string
): boolean {
  if (scope.type === "conversation") {
    return canonicalPath.startsWith(
      `${SCOPED_PREFIX_CONVERSATION}${scope.conversation_id}/`
    );
  }
  return canonicalPath.startsWith(`${SCOPED_PREFIX_POD}${scope.pod_id}/`);
}

const inputSchema = {
  scope: FILES_SCOPE_SCHEMA.describe(
    "File system scope for the conversation or Pod that owns the file."
  ),
  file_id: z
    .string()
    .describe(
      "File identifier starting with `fil_` (e.g. `fil_abc123def456`)."
    ),
};

export function registerFilesResolveTool(server: McpServer) {
  server.registerTool(
    "files_resolve",
    {
      description:
        "Resolve a file ID (e.g. `fil_abc123`) to its scoped file system path " +
        "(e.g. `conversation-<id>/report.pdf` or `pod-<id>/data.csv`) for use with `files_cat` or `files_grep`. " +
        "Requires an explicit scope with conversation_id or pod_id.",
      inputSchema,
    },
    async ({ scope, file_id }) => {
      const auth = getAuthenticatorFromMcpContext();

      const file = await FileResource.fetchById(auth, file_id);
      if (!file) {
        return mcpError(`File not found: \`${file_id}\`.`);
      }

      if (!file.mountFilePath) {
        return mcpError(
          `File \`${file_id}\` is not accessible through the file system.`
        );
      }

      const workspace = auth.workspace();
      const canonicalPath = gcsPathToCanonical(workspace, file.mountFilePath);
      if (!canonicalPath) {
        return mcpError(
          `File \`${file_id}\` is not accessible through the file system (use case: ${file.useCase}).`
        );
      }

      if (!scopeMatchesCanonicalPath(scope, canonicalPath)) {
        return mcpError(
          `File \`${file_id}\` does not belong to the given scope. Resolved path: \`${canonicalPath}\`.`
        );
      }

      const fsResult = await getDustFileSystemForScope(auth, scope);
      if (fsResult.isErr()) {
        return mcpError(fsResult.error);
      }

      const statResult = await fsResult.value.stat(canonicalPath);
      if (statResult.isErr()) {
        return mcpError(statResult.error.message);
      }
      if (!statResult.value) {
        return mcpError(
          `File \`${file_id}\` is not accessible through the file system.`
        );
      }

      return mcpJsonResponse({ path: canonicalPath });
    }
  );
}
