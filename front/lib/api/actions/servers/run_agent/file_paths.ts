import { MCPError } from "@app/lib/actions/mcp_errors";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import { resolveFile } from "@app/lib/api/actions/servers/files/tools/utils";
import { copyMountFile } from "@app/lib/api/files/gcs_mount/files";
import { parseScopedFilePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ResolvedScopedFilePath = {
  scopedPath: string;
  useCase: "conversation" | "pod";
  rel: string;
};

export async function resolveFilePathsInParentScope(
  auth: Authenticator,
  mainConversation: ConversationType,
  filePaths: string[]
): Promise<Result<ResolvedScopedFilePath[], MCPError>> {
  const resolved: ResolvedScopedFilePath[] = [];

  for (const scopedPath of filePaths) {
    const parsed = parseScopedFilePath(scopedPath);
    if (!parsed) {
      return new Err(
        new MCPError(
          `Invalid path: \`${scopedPath}\` must start with \`conversation/\` or \`pod/\`.`,
          { tracked: false }
        )
      );
    }

    // `resolveFile` resolves the mount point internally (with auth check) and confirms the
    // object exists in GCS.
    const fileRes = await resolveFile(auth, mainConversation, scopedPath);
    if (fileRes.isErr()) {
      return fileRes;
    }

    resolved.push({
      scopedPath,
      useCase: parsed.prefix,
      rel: parsed.rel,
    });
  }

  return new Ok(resolved);
}

/**
 * Append a one-line nudge so the sub-agent knows files were forwarded by the parent. The actual
 * names, sizes, and content types live in the files MCP server's `files__list` output.
 */
export function appendFilePathsHintToQuery(
  query: string,
  resolved: ResolvedScopedFilePath[]
): string {
  if (resolved.length === 0) {
    return query;
  }
  return `${query}\n\nSome files have been made available to you through the \`${FILES_SERVER_NAME}\` MCP server.`;
}

export async function copyConversationFilesIntoSub(
  auth: Authenticator,
  {
    parentConversation,
    subConversationId,
    resolvedFilePaths,
  }: {
    parentConversation: ConversationType;
    subConversationId: string;
    resolvedFilePaths: ResolvedScopedFilePath[];
  }
): Promise<Result<void, MCPError>> {
  const conversationScoped = resolvedFilePaths.filter(
    (p) => p.useCase === "conversation"
  );
  if (conversationScoped.length === 0) {
    return new Ok(undefined);
  }

  for (const p of conversationScoped) {
    // Re-validate auth and existence on every source.
    const fileRes = await resolveFile(auth, parentConversation, p.scopedPath);
    if (fileRes.isErr()) {
      return fileRes;
    }

    const copyRes = await copyMountFile(auth, {
      source: {
        scope: {
          useCase: "conversation",
          conversationId: parentConversation.sId,
        },
        relativeFilePath: p.rel,
      },
      dest: {
        scope: { useCase: "conversation", conversationId: subConversationId },
        relativeFilePath: p.rel,
      },
    });
    if (copyRes.isErr()) {
      return new Err(
        new MCPError(
          `Failed to copy \`${p.scopedPath}\` into the sub-conversation: ${copyRes.error.message}`
        )
      );
    }
  }

  return new Ok(undefined);
}
