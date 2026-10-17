import {
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import { readAuthorizedMountPath } from "@app/lib/api/files/authorization";
import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";
import { getDustFileSystemForScope } from "./context";
import type { FilesScope } from "./schemas";
import { FILES_SCOPE_SCHEMA } from "./schemas";

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

/**
 * @cc [owner:frankaloia,label:security] resolve-hides-foreign-mount
 * When the caller cannot read the file, or the caller-supplied scope is not the file's mount,
 * the error MUST NOT include the file's mount path, file name, conversation id, or pod id.
 * The path MUST be returned only after `readAuthorizedMountPath` yields `ok` and the
 * caller-supplied scope is that mount.
 */
export async function resolveScopedFilePath(
  auth: Authenticator,
  {
    scope,
    fileId,
  }: {
    scope: FilesScope;
    fileId: string;
  }
): Promise<Result<{ path: string }, string>> {
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return new Err(`File not found: \`${fileId}\`.`);
  }

  const mount = await readAuthorizedMountPath(auth, file);
  if (mount.status === "denied") {
    return new Err(`File not found: \`${fileId}\`.`);
  }
  if (mount.status === "unmounted") {
    return new Err(
      `File \`${fileId}\` is not accessible through the file system.`
    );
  }

  if (!scopeMatchesCanonicalPath(scope, mount.path)) {
    return new Err(`File \`${fileId}\` does not belong to the given scope.`);
  }

  const fsResult = await getDustFileSystemForScope(auth, scope);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }

  const statResult = await fsResult.value.stat(mount.path);
  if (statResult.isErr()) {
    return new Err(statResult.error.message);
  }
  if (!statResult.value) {
    return new Err(
      `File \`${fileId}\` is not accessible through the file system.`
    );
  }

  return new Ok({ path: mount.path });
}

export function registerFilesResolveTool(server: McpServer) {
  registerDustMcpTool(
    server,
    "files_resolve",
    {
      description:
        "Resolve a file ID (e.g. `fil_abc123`) to its scoped file system path " +
        "(e.g. `conversation-<id>/report.pdf` or `pod-<id>/data.csv`) for use with `files_cat` or `files_grep`. " +
        "Requires an explicit scope with conversation_id or pod_id.",
      inputSchema,
    },
    async (auth, { scope, file_id }) => {
      const result = await resolveScopedFilePath(auth, {
        scope,
        fileId: file_id,
      });
      if (result.isErr()) {
        return mcpError(result.error);
      }

      return mcpJsonResponse({ path: result.value.path });
    }
  );
}
