import { MCPError } from "@app/lib/actions/mcp_errors";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import {
  DustFileSystem,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Validate that every path in `filePaths` is accessible in the parent conversation's scope and
 * return the validated paths unchanged.
 *
 * `pod-<id>/...` paths are validated but not copied — the pod mount is shared across all
 * conversations in a pod. `conversation-<id>/...` paths are copied into the sub-conversation by
 * `copyConversationFilesIntoSub` once the sub-conversation exists.
 */
export async function resolveFilePathsInParentScope(
  auth: Authenticator,
  mainConversation: ConversationType,
  filePaths: string[]
): Promise<Result<string[], MCPError>> {
  const fsResult = await DustFileSystem.forConversation(auth, mainConversation);
  if (fsResult.isErr()) {
    return new Err(
      new MCPError("Failed to initialize file system.", { tracked: true })
    );
  }
  const fs = fsResult.value;

  for (const scopedPath of filePaths) {
    if (
      !scopedPath.startsWith(SCOPED_PREFIX_CONVERSATION) &&
      !scopedPath.startsWith(SCOPED_PREFIX_POD)
    ) {
      return new Err(
        new MCPError(
          `Invalid path: \`${scopedPath}\` must start with \`${SCOPED_PREFIX_CONVERSATION}\` or \`${SCOPED_PREFIX_POD}\`.`,
          { tracked: false }
        )
      );
    }

    const statResult = await fs.stat(scopedPath);
    if (statResult.isErr()) {
      return new Err(
        new MCPError(
          `File not found: \`${scopedPath}\`. ${statResult.error.message}`,
          { tracked: false }
        )
      );
    }
    if (!statResult.value) {
      return new Err(
        new MCPError(`File not found: \`${scopedPath}\`.`, { tracked: false })
      );
    }
  }

  return new Ok(filePaths);
}

/**
 * Append a one-line nudge so the sub-agent knows files were forwarded by the parent. The actual
 * names, sizes, and content types live in the files MCP server's `files__list` output.
 */
export function appendFilePathsHintToQuery(
  query: string,
  filePaths: string[]
): string {
  if (filePaths.length === 0) {
    return query;
  }
  return `${query}\n\nSome files have been made available to you through the \`${FILES_SERVER_NAME}\` MCP server.`;
}

export async function copyConversationFilesIntoSub(
  auth: Authenticator,
  {
    parentConversation,
    subConversationId,
    filePaths,
  }: {
    parentConversation: ConversationType;
    subConversationId: string;
    filePaths: string[];
  }
): Promise<Result<void, MCPError>> {
  const conversationPaths = filePaths.filter((p) =>
    p.startsWith(SCOPED_PREFIX_CONVERSATION)
  );
  if (conversationPaths.length === 0) {
    return new Ok(undefined);
  }

  const subConversation = await ConversationResource.fetchById(
    auth,
    subConversationId
  );
  if (!subConversation) {
    return new Err(
      new MCPError("Sub-conversation not found.", { tracked: true })
    );
  }

  const fsResult = await DustFileSystem.forConversations(auth, [
    parentConversation,
    subConversation.toJSON(),
  ]);
  if (fsResult.isErr()) {
    return new Err(
      new MCPError("Failed to initialize file system.", { tracked: true })
    );
  }
  const fs = fsResult.value;

  for (const src of conversationPaths) {
    const rel = src.slice(src.indexOf("/") + 1);
    const dest = `${SCOPED_PREFIX_CONVERSATION}${subConversationId}/${rel}`;
    const copyResult = await fs.copy({ src, dest });
    if (copyResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to copy \`${src}\` into the sub-conversation: ${copyResult.error.message}`
        )
      );
    }
  }

  return new Ok(undefined);
}
