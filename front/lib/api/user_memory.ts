import {
  DustFileSystem,
  DustFileSystemError,
} from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MAX_USER_MEMORY_CONTENT_LENGTH } from "@app/types/api/me/memory";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import {
  conversationMetadataScopedPath,
  userScopedPath,
} from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MEMORY_FILE_NAME = "MEMORY.md";

export const MEMORY_CONTENT_TYPE = "text/markdown";

export function userMemoryPath(userId: string): string {
  return userScopedPath(userId, MEMORY_FILE_NAME);
}

export function exceedsUserMemoryLimit(content: string): boolean {
  return content.length > MAX_USER_MEMORY_CONTENT_LENGTH;
}

export async function getUserMemory(
  auth: Authenticator
): Promise<Result<string, DustFileSystemError>> {
  const fsResult = await DustFileSystem.forUser(auth);
  if (fsResult.isErr()) {
    return fsResult;
  }

  // Having a user is guaranteed by DustFileSystem.forUser, so we can safely call getNonNullableUser here.
  const user = auth.getNonNullableUser();
  const readResult = await fsResult.value.readBuffer(userMemoryPath(user.sId));
  if (readResult.isErr()) {
    return readResult;
  }

  return new Ok(readResult.value?.toString("utf-8") ?? "");
}

/**
 * @cc [owner:aubin-tchoi,label:product;performance] memory-file-copied-once
 * When the conversation's `memoryFilePath` is null, the authenticated user's `MEMORY.md` MUST be
 * copied server side in GCS to the conversation metadata path
 * `conversation_metadata-{cId}/MEMORY.md`, whatever the conversation's storage mode, before that
 * path is recorded; when the user has no memory file, nothing is copied and the path is still
 * recorded. Once recorded, the path MUST be returned unchanged and nothing is copied.
 */
export async function ensureConversationMemoryFile(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<string, DustFileSystemError>> {
  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    return new Err(
      new DustFileSystemError(
        "not_found",
        `Conversation not found: ${conversation.sId}`
      )
    );
  }

  if (conversationResource.memoryFilePath !== null) {
    return new Ok(conversationResource.memoryFilePath);
  }

  const fsResult = await DustFileSystem.forConversationMetadata(
    auth,
    conversation
  );
  if (fsResult.isErr()) {
    return fsResult;
  }

  // Having a user is guaranteed by DustFileSystem.forConversationMetadata.
  const user = auth.getNonNullableUser();
  const memoryFilePath = conversationMetadataScopedPath({
    conversationId: conversation.sId,
    rel: MEMORY_FILE_NAME,
  });
  const copyResult = await fsResult.value.copy({
    src: userMemoryPath(user.sId),
    dest: memoryFilePath,
  });
  // A user without memory has no file to copy: the recorded path then reads as empty.
  if (copyResult.isErr() && copyResult.error.code !== "not_found") {
    return copyResult;
  }

  await conversationResource.updateMemoryFilePath(auth, memoryFilePath);

  return new Ok(memoryFilePath);
}

/**
 * @cc [owner:aubin-tchoi,label:product;performance] read-from-conversation-memory-file
 * Returns the content of the conversation's memory file, read from GCS at the path returned by
 * `ensureConversationMemoryFile`, never from the live user memory, whichever participant runs the
 * loop. A missing file reads as empty.
 */
export async function readConversationMemoryFile(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<string, DustFileSystemError>> {
  const memoryFilePathResult = await ensureConversationMemoryFile(
    auth,
    conversation
  );
  if (memoryFilePathResult.isErr()) {
    return memoryFilePathResult;
  }

  const fsResult = await DustFileSystem.forConversationMetadata(
    auth,
    conversation
  );
  if (fsResult.isErr()) {
    return fsResult;
  }

  const readResult = await fsResult.value.readBuffer(
    memoryFilePathResult.value
  );
  if (readResult.isErr()) {
    return readResult;
  }

  return new Ok(readResult.value?.toString("utf-8") ?? "");
}

export async function setUserMemory(
  auth: Authenticator,
  content: string
): Promise<Result<undefined, DustFileSystemError>> {
  const fsResult = await DustFileSystem.forUser(auth);
  if (fsResult.isErr()) {
    return fsResult;
  }

  const user = auth.getNonNullableUser();
  const writeResult = await fsResult.value.write(
    userMemoryPath(user.sId),
    content,
    MEMORY_CONTENT_TYPE
  );
  if (writeResult.isErr()) {
    return writeResult;
  }

  return new Ok(undefined);
}

export async function isUserMemoryEnabled(
  auth: Authenticator
): Promise<boolean> {
  const user = auth.user();
  if (!user) {
    return false;
  }
  return user.isMemoryEnabled(auth);
}

export async function setUserMemoryEnabled(
  auth: Authenticator,
  enabled: boolean
): Promise<void> {
  await auth.getNonNullableUser().setMemoryEnabled(auth, enabled);
}
