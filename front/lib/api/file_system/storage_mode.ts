import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

export type FileSystemStorageMode = "database" | "gcs";

/** Prefix used to opt a fresh Pod into the database-backed filesystem. */
export const DATABASE_FILE_SYSTEM_POD_PREFIX = "[Dust FS] ";

export function isDatabaseFileSystemPodName(name: string): boolean {
  return name.startsWith(DATABASE_FILE_SYSTEM_POD_PREFIX);
}

export function fileSystemStorageModeForPod(
  pod: Pick<SpaceResource, "name">
): FileSystemStorageMode {
  return isDatabaseFileSystemPodName(pod.name) ? "database" : "gcs";
}

export function fileSystemStorageModeForStandaloneConversation(
  conversation: Pick<ConversationWithoutContentType, "metadata">
): FileSystemStorageMode {
  return conversation.metadata?.useDatabaseFileSystem === true
    ? "database"
    : "gcs";
}
