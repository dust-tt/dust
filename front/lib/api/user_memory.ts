import type { Authenticator } from "@app/lib/auth";
import { MAX_USER_MEMORY_CONTENT_LENGTH } from "@app/types/api/me/memory";
import type { DustFileSystemError } from "@app/lib/api/file_system/dust_file_system";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { userScopedPath } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

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
